import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import { psychPrice } from '../src/utils/pricing.js';
import { api, auth, closeDb, createCategory, createProduct, createUser, resetDb } from './setup.js';

let admin;
let user;
let category;
let other;

beforeAll(async () => {
  await resetDb();
  admin = await createUser({ role: 'ADMIN' });
  user = await createUser();
  category = await createCategory(admin.token);
  other = await createCategory(admin.token);
});
afterAll(closeDb);

describe('Округление цен до …499 / …999', () => {
  test('ближайшее и вниз', () => {
    expect(psychPrice(2670)).toBe(2499);
    expect(psychPrice(2800)).toBe(2999);
    expect(psychPrice(120)).toBe(499);
    expect(psychPrice(3990, 'down')).toBe(3499);
    expect(psychPrice(0)).toBe(0);
  });
});

describe('Скидки на товары', () => {
  test('админ ставит скидку: в каталоге видны цена со скидкой и процент', async () => {
    const product = await createProduct(admin.token, category.id, { price: '10000' });
    const res = await api().patch(`/api/products/${product.id}`).set(auth(admin.token)).send({ salePrice: '7499' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ onSale: true, salePrice: '7499.00', finalPrice: '7499.00', discountPercent: 25 });

    const onSale = await api().get('/api/products').query({ onSale: 'true' });
    expect(onSale.body.data.map((p) => p.id)).toContain(product.id);
  });

  test('цена со скидкой не может быть выше или равна обычной → 400', async () => {
    const product = await createProduct(admin.token, category.id, { price: '5000' });
    const res = await api().patch(`/api/products/${product.id}`).set(auth(admin.token)).send({ salePrice: '5000' });
    expect(res.status).toBe(400);
    const create = await api().post('/api/products').set(auth(admin.token)).send({
      name: 'Bad Sale', description: 'Описание товара для теста скидки.', price: '100', salePrice: '200', categoryId: category.id,
    });
    expect(create.status).toBe(400);
  });

  test('заказ фиксирует цену со скидкой; истёкшая скидка не применяется', async () => {
    const product = await createProduct(admin.token, category.id, { price: '9999', salePrice: '4999' });
    const order = await api().post('/api/orders').set(auth(user.token)).send({ productId: product.id });
    expect(order.status).toBe(201);
    expect(order.body.data.priceAtPurchase).toBe('4999.00');

    const expired = await createProduct(admin.token, category.id, {
      price: '9999', salePrice: '4999', saleEndsAt: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(expired).toMatchObject({ onSale: false, finalPrice: '9999.00' });
    const guestView = await api().get(`/api/products/${expired.id}`);
    expect(guestView.body.data.salePrice).toBeNull();
    const order2 = await api().post('/api/orders').set(auth(user.token)).send({ productId: expired.id });
    expect(order2.body.data.priceAtPurchase).toBe('9999.00');
  });

  test('массовая скидка на категорию и её снятие', async () => {
    const p1 = await createProduct(admin.token, other.id, { price: '20000' });
    const p2 = await createProduct(admin.token, other.id, { price: '3999' });
    const apply = await api().post('/api/products/discounts').set(auth(admin.token)).send({ percent: 30, categoryId: other.id });
    expect(apply.status).toBe(200);
    expect(apply.body.data.updated).toBe(2);

    const after1 = (await api().get(`/api/products/${p1.id}`)).body.data;
    const after2 = (await api().get(`/api/products/${p2.id}`)).body.data;
    expect(after1.salePrice).toBe('13999.00'); // 14000 → вниз до …999
    expect(after2.salePrice).toBe('2499.00'); // 2799 → вниз до …499
    expect(Number(after1.salePrice) % 500).toBe(499);

    const clear = await api().delete('/api/products/discounts').query({ categoryId: other.id }).set(auth(admin.token));
    expect(clear.body.data.cleared).toBe(2);
    expect((await api().get(`/api/products/${p1.id}`)).body.data.onSale).toBe(false);
  });

  test('покупатель не может управлять скидками → 403; некорректный процент → 400', async () => {
    expect((await api().post('/api/products/discounts').set(auth(user.token)).send({ percent: 10 })).status).toBe(403);
    expect((await api().post('/api/products/discounts').set(auth(admin.token)).send({ percent: 0 })).status).toBe(400);
  });
});
