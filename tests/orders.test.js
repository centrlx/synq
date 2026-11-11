import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import {
  api, assertNoPasswordHash, auth, closeDb, createCategory, createProduct, createUser, disableStorage, prisma, resetDb, useMemoryStorage,
} from './setup.js';

let admin;
let alice;
let bob;
let product;
let limited;
let aliceOrderId;

beforeAll(async () => {
  await resetDb();
  useMemoryStorage();
  admin = await createUser({ role: 'ADMIN' });
  alice = await createUser();
  bob = await createUser();
  const category = await createCategory(admin.token);
  product = await createProduct(admin.token, category.id, { price: '79.00' });
  limited = await createProduct(admin.token, category.id, { price: '10.00', stock: 1 });
});
afterAll(async () => {
  disableStorage();
  await closeDb();
});

describe('Orders', () => {
  test('16. создание заказа: владелец из JWT, цена из БД, статус PENDING', async () => {
    const res = await api().post('/api/orders').set(auth(alice.token)).send({ productId: product.id });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      userId: alice.user.id,
      productId: product.id,
      priceAtPurchase: '79.00',
      status: 'PENDING',
      product: { id: product.id, name: product.name },
    });
    aliceOrderId = res.body.data.id;
  });

  test('клиентский userId не принимается (400), заказ без JWT → 401', async () => {
    const spoof = await api().post('/api/orders').set(auth(alice.token)).send({ productId: product.id, userId: bob.user.id });
    expect(spoof.status).toBe(400);
    expect((await api().post('/api/orders').send({ productId: product.id })).status).toBe(401);
  });

  test('повторный заказ того же товара → 409 ALREADY_ORDERED', async () => {
    const res = await api().post('/api/orders').set(auth(alice.token)).send({ productId: product.id });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ALREADY_ORDERED');
  });

  test('остатки: последняя лицензия резервируется, следующая попытка → 409 OUT_OF_STOCK', async () => {
    const first = await api().post('/api/orders').set(auth(alice.token)).send({ productId: limited.id });
    expect(first.status).toBe(201);
    expect((await prisma.product.findUnique({ where: { id: limited.id } })).stock).toBe(0);

    const second = await api().post('/api/orders').set(auth(bob.token)).send({ productId: limited.id });
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('OUT_OF_STOCK');

    // Отмена возвращает лицензию в остаток
    const cancel = await api().patch(`/api/orders/${first.body.data.id}/status`).set(auth(alice.token)).send({ status: 'CANCELLED' });
    expect(cancel.status).toBe(200);
    expect((await prisma.product.findUnique({ where: { id: limited.id } })).stock).toBe(1);
  });

  test('17. GET /api/orders/my возвращает только собственные заказы', async () => {
    await api().post('/api/orders').set(auth(bob.token)).send({ productId: product.id });
    const res = await api().get('/api/orders/my').set(auth(alice.token));
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.data.every((o) => o.userId === alice.user.id)).toBe(true);
    expect(res.body.data[0].product).not.toHaveProperty('filePath');
  });

  test('18. чужой заказ: просмотр, смена статуса и скачивание → 403', async () => {
    expect((await api().get(`/api/orders/${aliceOrderId}`).set(auth(bob.token))).status).toBe(403);
    expect((await api().patch(`/api/orders/${aliceOrderId}/status`).set(auth(bob.token)).send({ status: 'CANCELLED' })).status).toBe(403);
    expect((await api().get(`/api/orders/${aliceOrderId}/download`).set(auth(bob.token))).status).toBe(403);
    expect((await api().get(`/api/orders/${aliceOrderId}`).set(auth(alice.token))).status).toBe(200);
  });

  test('19. скачивание неоплаченного заказа → 403 ORDER_NOT_PAID', async () => {
    const res = await api().get(`/api/orders/${aliceOrderId}/download`).set(auth(alice.token));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('ORDER_NOT_PAID');
  });

  test('покупатель не может сам отметить заказ оплаченным → 403', async () => {
    const res = await api().patch(`/api/orders/${aliceOrderId}/status`).set(auth(alice.token)).send({ status: 'PAID' });
    expect(res.status).toBe(403);
  });

  test('админ: список всех заказов с покупателем, подтверждение оплаты', async () => {
    const list = await api().get('/api/orders').set(auth(admin.token));
    expect(list.status).toBe(200);
    expect(list.body.data[0].user).toEqual(expect.objectContaining({ email: expect.any(String) }));
    assertNoPasswordHash(list.body);

    expect((await api().get('/api/orders').set(auth(alice.token))).status).toBe(403);

    const paid = await api().patch(`/api/orders/${aliceOrderId}/status`).set(auth(admin.token)).send({ status: 'PAID' });
    expect(paid.status).toBe(200);
    expect(paid.body.data.status).toBe('PAID');
  });

  test('оплаченный заказ без загруженного файла → 404 FILE_NOT_AVAILABLE', async () => {
    const res = await api().get(`/api/orders/${aliceOrderId}/download`).set(auth(alice.token));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('FILE_NOT_AVAILABLE');
  });

  test('после загрузки файла владелец оплаченного заказа получает подписанную ссылку', async () => {
    const upload = await api().post('/api/uploads/product-file').set(auth(admin.token))
      .field('productId', product.id)
      .attach('file', Buffer.from('PK\u0003\u0004 synq test archive'), 'Wavetable Presets.zip');
    expect(upload.status).toBe(201);
    expect(upload.body.data).toMatchObject({ hasFile: true, fileName: 'Wavetable_Presets.zip' });

    const res = await api().get(`/api/orders/${aliceOrderId}/download`).set(auth(alice.token));
    expect(res.status).toBe(200);
    expect(res.body.data.url).toMatch(/^https:\/\/storage\.test\/signed\//);
    expect(res.body.data.expiresIn).toBeGreaterThan(0);
  });

  test('недопустимый переход статуса → 409, повторный заказ купленного товара → 409', async () => {
    await api().patch(`/api/orders/${aliceOrderId}/status`).set(auth(admin.token)).send({ status: 'CANCELLED' });
    const back = await api().patch(`/api/orders/${aliceOrderId}/status`).set(auth(admin.token)).send({ status: 'PAID' });
    expect(back.status).toBe(409);
    expect(back.body.error.code).toBe('INVALID_STATUS_TRANSITION');
  });

  test('удаление товара с заказами → мягкое удаление (архив), история заказов сохраняется', async () => {
    const res = await api().delete(`/api/products/${product.id}`).set(auth(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ deleted: false, archived: true });
    const stored = await prisma.product.findUnique({ where: { id: product.id }, include: { orders: true } });
    expect(stored.isActive).toBe(false);
    expect(stored.orders.length).toBeGreaterThan(0);

    const order = await api().post('/api/orders').set(auth(admin.token)).send({ productId: product.id });
    expect(order.status).toBe(404);
  });
});
