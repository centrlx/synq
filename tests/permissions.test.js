import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import {
  api, assertNoPasswordHash, auth, closeDb, createCategory, createProduct, createUser, disableStorage, resetDb, useMemoryStorage,
} from './setup.js';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8ffff3f0005fe02fea7d6a4b70000000049454e44ae426082', 'hex');

let admin;
let user;
let category;
let product;

beforeAll(async () => {
  await resetDb();
  admin = await createUser({ role: 'ADMIN' });
  user = await createUser();
  category = await createCategory(admin.token);
  product = await createProduct(admin.token, category.id);
});
afterAll(async () => {
  disableStorage();
  await closeDb();
});

describe('Матрица прав guest / user / admin', () => {
  test('гость: читает каталог, но не имеет доступа к закрытым маршрутам (401)', async () => {
    expect((await api().get('/api/products')).status).toBe(200);
    expect((await api().get('/api/categories')).status).toBe(200);
    for (const [method, url] of [
      ['get', '/api/orders/my'], ['get', '/api/users'], ['get', '/api/stats'], ['patch', '/api/users/me'],
      ['post', '/api/uploads/product-image'], ['delete', `/api/products/${product.id}`],
    ]) {
      const res = await api()[method](url);
      expect([method, url, res.status]).toEqual([method, url, 401]);
    }
  });

  test('user: административные маршруты → 403', async () => {
    for (const [method, url] of [
      ['get', '/api/users'], ['get', '/api/orders'], ['get', '/api/stats'],
      ['post', '/api/categories'], ['patch', `/api/users/${admin.user.id}/role`],
    ]) {
      const res = await api()[method](url).set(auth(user.token)).send({});
      expect([method, url, res.status]).toEqual([method, url, 403]);
    }
  });

  test('user: видит свой профиль по ID, чужой → 403', async () => {
    expect((await api().get(`/api/users/${user.user.id}`).set(auth(user.token))).status).toBe(200);
    expect((await api().get(`/api/users/${admin.user.id}`).set(auth(user.token))).status).toBe(403);
  });

  test('admin: список пользователей и профиль с заказами (include), без passwordHash', async () => {
    const list = await api().get('/api/users').set(auth(admin.token));
    expect(list.status).toBe(200);
    expect(list.body.data.length).toBe(2);
    assertNoPasswordHash(list.body);

    const one = await api().get(`/api/users/${user.user.id}`).set(auth(admin.token));
    expect(one.status).toBe(200);
    expect(one.body.data).toHaveProperty('orders');
    assertNoPasswordHash(one.body);
  });

  test('admin: назначение роли; повышение вступает в силу сразу; свою роль менять нельзя', async () => {
    const self = await api().patch(`/api/users/${admin.user.id}/role`).set(auth(admin.token)).send({ role: 'USER' });
    expect(self.status).toBe(409);

    const promote = await api().patch(`/api/users/${user.user.id}/role`).set(auth(admin.token)).send({ role: 'ADMIN' });
    expect(promote.status).toBe(200);
    expect((await api().get('/api/stats').set(auth(user.token))).status).toBe(200);

    await api().patch(`/api/users/${user.user.id}/role`).set(auth(admin.token)).send({ role: 'USER' });
    expect((await api().get('/api/stats').set(auth(user.token))).status).toBe(403);
  });

  test('PATCH /api/users/me: смена имени и пароля с проверкой текущего, роль не меняется', async () => {
    const name = await api().patch('/api/users/me').set(auth(user.token)).send({ name: 'Новое имя' });
    expect(name.status).toBe(200);
    expect(name.body.data.name).toBe('Новое имя');

    const roleHack = await api().patch('/api/users/me').set(auth(user.token)).send({ role: 'ADMIN' });
    expect(roleHack.status).toBe(400);

    const wrong = await api().patch('/api/users/me').set(auth(user.token)).send({ currentPassword: 'nope', newPassword: 'NewPass123' });
    expect(wrong.status).toBe(400);

    const change = await api().patch('/api/users/me').set(auth(user.token)).send({ currentPassword: user.password, newPassword: 'NewPass123' });
    expect(change.status).toBe(200);
    expect((await api().post('/api/auth/login').send({ email: user.email, password: 'NewPass123' })).status).toBe(200);
  });

  test('20. ни один ответ не содержит passwordHash', async () => {
    const responses = await Promise.all([
      api().get('/api/auth/me').set(auth(admin.token)),
      api().get('/api/users').set(auth(admin.token)),
      api().get(`/api/users/${user.user.id}`).set(auth(admin.token)),
      api().patch('/api/users/me').set(auth(admin.token)).send({ name: 'Admin' }),
      api().post('/api/auth/login').send({ email: admin.email, password: admin.password }),
      api().get('/api/stats').set(auth(admin.token)),
    ]);
    responses.forEach((res) => {
      expect(res.status).toBe(200);
      assertNoPasswordHash(res.body);
    });
  });

  test('статистика содержит только реальные агрегаты', async () => {
    const res = await api().get('/api/stats').set(auth(admin.token));
    expect(res.body.data).toMatchObject({
      users: { total: 2, admins: 1 },
      products: { active: 1, archived: 0 },
      orders: { PENDING: 0, PAID: 0, CANCELLED: 0, total: 0 },
      revenue: '0.00',
    });
  });
});

describe('Загрузка файлов', () => {
  test('без настроенного хранилища → 503 STORAGE_NOT_CONFIGURED', async () => {
    disableStorage();
    const res = await api().post('/api/uploads/product-image').set(auth(admin.token))
      .field('productId', product.id).attach('file', PNG, { filename: 'cover.png', contentType: 'image/png' });
    expect(res.status).toBe(503);
  });

  test('изображение: загрузка, замена и удаление администратором', async () => {
    const objects = useMemoryStorage();
    const first = await api().post('/api/uploads/product-image').set(auth(admin.token))
      .field('productId', product.id).attach('file', PNG, { filename: 'cover.png', contentType: 'image/png' });
    expect(first.status).toBe(201);
    expect(first.body.data.imageUrl).toMatch(/^https:\/\/storage\.test\/product-images\/products\//);

    const second = await api().post('/api/uploads/product-image').set(auth(admin.token))
      .field('productId', product.id).attach('file', PNG, { filename: 'cover2.png', contentType: 'image/png' });
    expect(second.status).toBe(201);
    expect(objects.size).toBe(1); // старое изображение удалено из хранилища

    const del = await api().delete(`/api/uploads/product-image/${product.id}`).set(auth(admin.token));
    expect(del.status).toBe(200);
    expect(del.body.data.imageUrl).toBeNull();
    expect(objects.size).toBe(0);
  });

  test('подделанное изображение (не PNG внутри) → 400, недопустимое расширение → 400', async () => {
    useMemoryStorage();
    const fake = await api().post('/api/uploads/product-image').set(auth(admin.token))
      .field('productId', product.id).attach('file', Buffer.from('<script>alert(1)</script>'), { filename: 'x.png', contentType: 'image/png' });
    expect(fake.status).toBe(400);
    expect(fake.body.error.code).toBe('INVALID_FILE_CONTENT');

    const exe = await api().post('/api/uploads/product-file').set(auth(admin.token))
      .field('productId', product.id).attach('file', Buffer.from('<h1>hi</h1>'), { filename: 'page.html', contentType: 'text/html' });
    expect(exe.status).toBe(400);
    expect(exe.body.error.code).toBe('INVALID_FILE_TYPE');
  });

  test('лицензия .txt (text/plain) принимается, .txt с подменённым MIME — нет', async () => {
    useMemoryStorage();
    const ok = await api().post('/api/uploads/product-file').set(auth(admin.token))
      .field('productId', product.id).attach('file', Buffer.from('LICENSE FOR TEST'), { filename: 'license.txt', contentType: 'text/plain' });
    expect(ok.status).toBe(201);
    expect(ok.body.data.fileName).toBe('license.txt');

    const spoof = await api().post('/api/uploads/product-file').set(auth(admin.token))
      .field('productId', product.id).attach('file', Buffer.from('<script></script>'), { filename: 'license.txt', contentType: 'text/html' });
    expect(spoof.status).toBe(400);
  });

  test('без файла → 400, пользователь USER → 403', async () => {
    const noFile = await api().post('/api/uploads/product-file').set(auth(admin.token)).field('productId', product.id);
    expect(noFile.status).toBe(400);
    const asUser = await api().post('/api/uploads/product-file').set(auth(user.token))
      .field('productId', product.id).attach('file', Buffer.from('PK'), 'a.zip');
    expect(asUser.status).toBe(403);
  });
});
