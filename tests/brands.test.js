import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import { api, auth, closeDb, createCategory, createProduct, createUser, resetDb } from './setup.js';

let admin;

beforeAll(async () => {
  await resetDb();
  admin = await createUser({ role: 'ADMIN' });
  const category = await createCategory(admin.token);
  await createProduct(admin.token, category.id, { developer: 'FabFilter' });
  await createProduct(admin.token, category.id, { developer: 'FabFilter' });
  await createProduct(admin.token, category.id, { developer: 'u-he' });
  const archived = await createProduct(admin.token, category.id, { developer: 'Hidden Dev' });
  await api().patch(`/api/products/${archived.id}`).set(auth(admin.token)).send({ isActive: false });
});
afterAll(closeDb);

describe('Бренды', () => {
  test('GET /api/brands — бренды активных товаров с количеством, по алфавиту', async () => {
    const res = await api().get('/api/brands');
    expect(res.status).toBe(200);
    expect(res.body.data.map((b) => [b.name, b.productsCount])).toEqual([['FabFilter', 2], ['u-he', 1]]);
    expect(Array.isArray(res.body.data[0].images)).toBe(true);
  });

  test('фильтр каталога по разработчику без учёта регистра', async () => {
    const res = await api().get('/api/products').query({ developer: 'fabfilter' });
    expect(res.status).toBe(200);
    expect(res.body.meta.total).toBe(2);
    expect(res.body.data.every((p) => p.developer === 'FabFilter')).toBe(true);
  });
});
