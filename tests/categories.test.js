import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import { api, auth, closeDb, createProduct, createUser, resetDb } from './setup.js';

let admin;
let user;

beforeAll(async () => {
  await resetDb();
  admin = await createUser({ role: 'ADMIN' });
  user = await createUser();
});
afterAll(closeDb);

describe('14. CRUD категорий', () => {
  let categoryId;

  test('пустой список категорий на чистой БД', async () => {
    const res = await api().get('/api/categories');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
  });

  test('POST: администратор создаёт категорию, slug формируется транслитерацией', async () => {
    const res = await api().post('/api/categories').set(auth(admin.token))
      .send({ name: 'Синтезаторы', description: 'Виртуальные синтезаторы' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ name: 'Синтезаторы', slug: 'sintezatory' });
    categoryId = res.body.data.id;
  });

  test('POST: дубликат slug → 409', async () => {
    const res = await api().post('/api/categories').set(auth(admin.token)).send({ name: 'Другая', slug: 'sintezatory' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('SLUG_TAKEN');
  });

  test('POST: пользователь USER → 403, гость → 401', async () => {
    expect((await api().post('/api/categories').set(auth(user.token)).send({ name: 'Effects' })).status).toBe(403);
    expect((await api().post('/api/categories').send({ name: 'Effects' })).status).toBe(401);
  });

  test('GET по ID и 404 для несуществующей', async () => {
    const res = await api().get(`/api/categories/${categoryId}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ id: categoryId, productsCount: 0 });

    const missing = await api().get('/api/categories/00000000-0000-4000-8000-000000000000');
    expect(missing.status).toBe(404);
  });

  test('GET с некорректным UUID → 400', async () => {
    const res = await api().get('/api/categories/not-a-uuid');
    expect(res.status).toBe(400);
  });

  test('PATCH: изменение описания', async () => {
    const res = await api().patch(`/api/categories/${categoryId}`).set(auth(admin.token)).send({ description: 'Обновлено' });
    expect(res.status).toBe(200);
    expect(res.body.data.description).toBe('Обновлено');
  });

  test('PATCH: пустое тело → 400', async () => {
    const res = await api().patch(`/api/categories/${categoryId}`).set(auth(admin.token)).send({});
    expect(res.status).toBe(400);
  });

  test('DELETE: категорию с товарами удалить нельзя → 409', async () => {
    const product = await createProduct(admin.token, categoryId);
    const res = await api().delete(`/api/categories/${categoryId}`).set(auth(admin.token));
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CATEGORY_NOT_EMPTY');
    await api().delete(`/api/products/${product.id}`).set(auth(admin.token));
  });

  test('DELETE: пустая категория удаляется', async () => {
    const res = await api().delete(`/api/categories/${categoryId}`).set(auth(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ id: categoryId, deleted: true });
    expect((await api().get(`/api/categories/${categoryId}`)).status).toBe(404);
  });
});
