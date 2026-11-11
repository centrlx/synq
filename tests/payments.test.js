import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import { api, auth, closeDb, createCategory, createProduct, createUser, resetDb } from './setup.js';

let admin;
let buyer;
let stranger;
let category;

beforeAll(async () => {
  await resetDb();
  admin = await createUser({ role: 'ADMIN' });
  buyer = await createUser();
  stranger = await createUser();
  category = await createCategory(admin.token);
});
afterAll(closeDb);

async function newOrder(token = buyer.token) {
  const product = await createProduct(admin.token, category.id, { price: '7999' });
  const res = await api().post('/api/orders').set(auth(token)).send({ productId: product.id });
  return res.body.data;
}

describe('Оплата заказа картой', () => {
  test('владелец оплачивает заказ: статус PAID, номер транзакции и последние 4 цифры', async () => {
    const order = await newOrder();
    const res = await api().post(`/api/orders/${order.id}/pay`).set(auth(buyer.token)).send({ cardBrand: 'visa', cardLast4: '4242' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'PAID', cardBrand: 'visa', cardLast4: '4242' });
    expect(res.body.data.paymentRef).toMatch(/^SQ-[0-9A-F]{12}$/);
    expect(res.body.data.paidAt).toBeTruthy();

    const again = await api().post(`/api/orders/${order.id}/pay`).set(auth(buyer.token)).send({ cardBrand: 'visa', cardLast4: '4242' });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_PAID');
  });

  test('полный номер карты и CVV сервер не принимает → 400', async () => {
    const order = await newOrder();
    const res = await api().post(`/api/orders/${order.id}/pay`).set(auth(buyer.token))
      .send({ cardBrand: 'visa', cardLast4: '4242', cardNumber: '4242424242424242', cvc: '123' });
    expect(res.status).toBe(400);
  });

  test('отказ банка (карта …0002) → 402, заказ остаётся неоплаченным', async () => {
    const order = await newOrder();
    const res = await api().post(`/api/orders/${order.id}/pay`).set(auth(buyer.token)).send({ cardBrand: 'mastercard', cardLast4: '0002' });
    expect(res.status).toBe(402);
    expect(res.body.error.code).toBe('PAYMENT_DECLINED');
    const check = await api().get(`/api/orders/${order.id}`).set(auth(buyer.token));
    expect(check.body.data.status).toBe('PENDING');
  });

  test('чужой заказ оплатить нельзя → 403, без входа → 401', async () => {
    const order = await newOrder();
    expect((await api().post(`/api/orders/${order.id}/pay`).set(auth(stranger.token)).send({ cardBrand: 'visa', cardLast4: '4242' })).status).toBe(403);
    expect((await api().post(`/api/orders/${order.id}/pay`).send({ cardBrand: 'visa', cardLast4: '4242' })).status).toBe(401);
  });

  test('отменённый заказ оплатить нельзя → 409', async () => {
    const order = await newOrder();
    await api().patch(`/api/orders/${order.id}/status`).set(auth(buyer.token)).send({ status: 'CANCELLED' });
    const res = await api().post(`/api/orders/${order.id}/pay`).set(auth(buyer.token)).send({ cardBrand: 'visa', cardLast4: '4242' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('ORDER_NOT_PENDING');
  });
});
