import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import { api, assertNoPasswordHash, auth, closeDb, createCategory, createUser, prisma, resetDb } from './setup.js';

let admin;
let user;
let synths;
let samples;

beforeAll(async () => {
  await resetDb();
  admin = await createUser({ role: 'ADMIN' });
  user = await createUser();
  synths = await createCategory(admin.token, { name: 'Synths', slug: 'synths' });
  samples = await createCategory(admin.token, { name: 'Sample Packs', slug: 'sample-packs' });
});
afterAll(closeDb);

describe('Products CRUD', () => {
  let productId;

  test('8. GET /api/products на пустом каталоге → пустой список и корректная мета', async () => {
    const res = await api().get('/api/products');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta).toEqual({ page: 1, limit: 12, total: 0, totalPages: 1 });
  });

  test('10. администратор создаёт товар', async () => {
    const res = await api().post('/api/products').set(auth(admin.token)).send({
      name: 'Wavetable Synth',
      description: 'Волновой синтезатор с модуляционной матрицей.',
      price: 149.5,
      categoryId: synths.id,
      developer: 'SYNQ Audio',
      version: '1.2.0',
      formats: ['VST3', 'AU'],
      platforms: ['macOS', 'Windows'],
      stock: 2,
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      name: 'Wavetable Synth',
      slug: 'wavetable-synth',
      price: '149.50',
      isActive: true,
      hasFile: false,
      formats: ['VST3', 'AU'],
      stock: 2,
      category: { id: synths.id, slug: 'synths' },
    });
    productId = res.body.data.id;
  });

  test('создание с несуществующей категорией → 404, с неверными типами → 400', async () => {
    const missing = await api().post('/api/products').set(auth(admin.token)).send({
      name: 'X Plugin', description: 'Описание товара достаточной длины', price: 1, categoryId: '00000000-0000-4000-8000-000000000000',
    });
    expect(missing.status).toBe(404);

    const invalid = await api().post('/api/products').set(auth(admin.token)).send({
      name: 'X', description: 'кратко', price: -5, categoryId: 'abc', stock: 'many',
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.details.length).toBeGreaterThanOrEqual(4);
  });

  test('повторный slug при автогенерации получает суффикс, явный дубликат → 409', async () => {
    const auto = await api().post('/api/products').set(auth(admin.token)).send({
      name: 'Wavetable Synth', description: 'Второй товар с тем же названием.', price: 10, categoryId: synths.id,
    });
    expect(auto.status).toBe(201);
    expect(auto.body.data.slug).toBe('wavetable-synth-2');

    const dup = await api().post('/api/products').set(auth(admin.token)).send({
      name: 'Other', slug: 'wavetable-synth', description: 'Описание другого товара.', price: 10, categoryId: synths.id,
    });
    expect(dup.status).toBe(409);
  });

  test('9. GET /api/products/:id возвращает товар с категорией (include)', async () => {
    const res = await api().get(`/api/products/${productId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(productId);
    expect(res.body.data.category).toMatchObject({ id: synths.id, name: 'Synths' });
    expect(res.body.data).not.toHaveProperty('filePath');
  });

  test('11. PATCH изменяет поля товара', async () => {
    const res = await api().patch(`/api/products/${productId}`).set(auth(admin.token))
      .send({ price: '129.00', categoryId: samples.id, version: '1.3.0' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ price: '129.00', version: '1.3.0', category: { id: samples.id } });
  });

  test('PATCH с неизвестным полем (mass assignment) → 400', async () => {
    const res = await api().patch(`/api/products/${productId}`).set(auth(admin.token)).send({ filePath: 'hack/evil.zip' });
    expect(res.status).toBe(400);
  });

  test('поиск, фильтрация, сортировка и пагинация', async () => {
    await api().post('/api/products').set(auth(admin.token)).send({
      name: 'Drum Kit Vol. 1', description: 'Набор барабанных сэмплов.', price: 19, categoryId: samples.id, platforms: ['Linux'],
    });

    const search = await api().get('/api/products').query({ search: 'drum' });
    expect(search.body.data.map((p) => p.name)).toEqual(['Drum Kit Vol. 1']);

    const byCategorySlug = await api().get('/api/products').query({ category: 'sample-packs', sort: 'price_asc' });
    expect(byCategorySlug.body.data.map((p) => p.price)).toEqual(['19.00', '129.00']);

    const byPrice = await api().get('/api/products').query({ minPrice: 100, maxPrice: 200 });
    expect(byPrice.body.data.every((p) => Number(p.price) >= 100 && Number(p.price) <= 200)).toBe(true);

    const byPlatform = await api().get('/api/products').query({ platform: 'Linux' });
    expect(byPlatform.body.data).toHaveLength(1);

    const page = await api().get('/api/products').query({ limit: 2, page: 2, sort: 'name_asc' });
    expect(page.body.meta).toMatchObject({ page: 2, limit: 2, total: 3, totalPages: 2 });
    expect(page.body.data).toHaveLength(1);

    const empty = await api().get('/api/products').query({ search: 'no-such-product' });
    expect(empty.status).toBe(200);
    expect(empty.body.data).toEqual([]);

    const badSort = await api().get('/api/products').query({ sort: 'random' });
    expect(badSort.status).toBe(400);
  });

  test('15. связанная выборка: GET /api/categories/:id/products', async () => {
    const res = await api().get(`/api/categories/${samples.id}/products`);
    expect(res.status).toBe(200);
    expect(res.body.data.category).toMatchObject({ id: samples.id, slug: 'sample-packs' });
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.items.every((p) => p.category.id === samples.id)).toBe(true);
    expect(res.body.meta.total).toBe(2);
  });

  test('12. DELETE без заказов удаляет товар физически', async () => {
    const res = await api().delete(`/api/products/${productId}`).set(auth(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ deleted: true, archived: false });
    expect(await prisma.product.findUnique({ where: { id: productId } })).toBeNull();
    expect((await api().get(`/api/products/${productId}`)).status).toBe(404);
  });

  test('13. USER не может создавать, изменять и удалять товары → 403', async () => {
    const [anyProduct] = (await api().get('/api/products')).body.data;
    const create = await api().post('/api/products').set(auth(user.token)).send({
      name: 'Hack', description: 'Попытка создать товар.', price: 1, categoryId: synths.id,
    });
    expect(create.status).toBe(403);
    expect(create.body.error.code).toBe('FORBIDDEN');
    expect((await api().patch(`/api/products/${anyProduct.id}`).set(auth(user.token)).send({ price: 0 })).status).toBe(403);
    expect((await api().delete(`/api/products/${anyProduct.id}`).set(auth(user.token))).status).toBe(403);
  });

  test('архивный товар скрыт от гостей, но виден администратору', async () => {
    const [anyProduct] = (await api().get('/api/products')).body.data;
    await api().patch(`/api/products/${anyProduct.id}`).set(auth(admin.token)).send({ isActive: false });

    expect((await api().get(`/api/products/${anyProduct.id}`)).status).toBe(404);
    const guestArchived = await api().get('/api/products').query({ status: 'archived' });
    expect(guestArchived.body.data.find((p) => p.id === anyProduct.id)).toBeUndefined();

    const adminArchived = await api().get('/api/products').query({ status: 'archived' }).set(auth(admin.token));
    expect(adminArchived.body.data.map((p) => p.id)).toContain(anyProduct.id);
    assertNoPasswordHash(adminArchived.body);
  });
});
