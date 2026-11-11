import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import { api, assertNoPasswordHash, auth, closeDb, createCategory, createProduct, createUser, resetDb } from './setup.js';

let admin;
let buyer;
let other;
let product;
let second;

async function buy(user, productId) {
  const order = (await api().post('/api/orders').set(auth(user.token)).send({ productId })).body.data;
  await api().post(`/api/orders/${order.id}/pay`).set(auth(user.token)).send({ cardBrand: 'visa', cardLast4: '4242' });
  return order;
}

beforeAll(async () => {
  await resetDb();
  admin = await createUser({ role: 'ADMIN' });
  buyer = await createUser();
  other = await createUser();
  const category = await createCategory(admin.token);
  product = await createProduct(admin.token, category.id, { price: '4999' });
  second = await createProduct(admin.token, category.id, { price: '2999' });
});
afterAll(closeDb);

describe('Отзывы', () => {
  let reviewId;

  test('без покупки оставить отзыв нельзя → 403', async () => {
    const res = await api().post(`/api/products/${product.id}/reviews`).set(auth(buyer.token)).send({ rating: 5, text: 'Отличный плагин, звучит прекрасно.' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('REVIEW_REQUIRES_PURCHASE');
    const state = await api().get(`/api/products/${product.id}/reviews/me`).set(auth(buyer.token));
    expect(state.body.data).toMatchObject({ purchased: false, canReview: false, review: null });
  });

  test('после оплаты отзыв создаётся; повторный → 409', async () => {
    await buy(buyer, product.id);
    const state = await api().get(`/api/products/${product.id}/reviews/me`).set(auth(buyer.token));
    expect(state.body.data.canReview).toBe(true);

    const res = await api().post(`/api/products/${product.id}/reviews`).set(auth(buyer.token)).send({ rating: 4, text: 'Хороший эквалайзер, удобный интерфейс.' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ rating: 4, user: { name: 'Test User' }, product: { id: product.id } });
    expect(res.body.data.user).not.toHaveProperty('email');
    assertNoPasswordHash(res.body);
    reviewId = res.body.data.id;

    const again = await api().post(`/api/products/${product.id}/reviews`).set(auth(buyer.token)).send({ rating: 5, text: 'Второй отзыв на тот же товар.' });
    expect(again.status).toBe(409);
  });

  test('валидация: оценка 1–5 и текст от 10 символов', async () => {
    await buy(other, product.id);
    const res = await api().post(`/api/products/${product.id}/reviews`).set(auth(other.token)).send({ rating: 6, text: 'коротко' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d) => d.field)).toEqual(expect.arrayContaining(['rating', 'text']));
  });

  test('сводка рейтинга товара и в карточке каталога', async () => {
    await api().post(`/api/products/${product.id}/reviews`).set(auth(other.token)).send({ rating: 5, text: 'Лучший плагин в своей категории.' });
    const res = await api().get(`/api/products/${product.id}/reviews`);
    expect(res.status).toBe(200);
    expect(res.body.data.summary).toEqual({ average: 4.5, count: 2, distribution: { 5: 1, 4: 1, 3: 0, 2: 0, 1: 0 } });

    const card = (await api().get('/api/products').query({ search: product.name })).body.data[0];
    expect(card).toMatchObject({ ratingAvg: 4.5, reviewsCount: 2 });
    const page = (await api().get(`/api/products/${product.id}`)).body.data;
    expect(page).toMatchObject({ ratingAvg: 4.5, reviewsCount: 2 });
  });

  test('лента всех отзывов с фильтром по оценке', async () => {
    const all = await api().get('/api/reviews');
    expect(all.body.data.items).toHaveLength(2);
    expect(all.body.data.summary.count).toBe(2);
    const five = await api().get('/api/reviews').query({ rating: 5 });
    expect(five.body.data.items.every((r) => r.rating === 5)).toBe(true);
  });

  test('редактировать может только автор; удалить — автор или администратор', async () => {
    expect((await api().patch(`/api/reviews/${reviewId}`).set(auth(other.token)).send({ rating: 1 })).status).toBe(403);
    const edit = await api().patch(`/api/reviews/${reviewId}`).set(auth(buyer.token)).send({ rating: 5 });
    expect(edit.body.data.rating).toBe(5);
    expect((await api().delete(`/api/reviews/${reviewId}`).set(auth(other.token))).status).toBe(403);
    expect((await api().delete(`/api/reviews/${reviewId}`).set(auth(admin.token))).status).toBe(200);
  });
});

describe('Самое популярное', () => {
  test('считается по оплаченным покупкам и просмотрам', async () => {
    // второй товар: только просмотры
    await api().post(`/api/products/${second.id}/view`);
    await api().post(`/api/products/${second.id}/view`);

    const res = await api().get('/api/products/popular');
    expect(res.status).toBe(200);
    const ids = res.body.data.map((p) => p.id);
    expect(ids[0]).toBe(product.id); // 2 покупки × 20 > 2 просмотра
    expect(ids).toContain(second.id);
    expect(res.body.data[0].salesCount).toBe(2);
  });

  test('просмотр несуществующего товара → 404', async () => {
    expect((await api().post('/api/products/00000000-0000-4000-8000-000000000000/view')).status).toBe(404);
  });
});
