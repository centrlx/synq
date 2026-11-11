import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/config/prisma.js';
import { env } from '../src/config/env.js';
import { setStorageDriver } from '../src/services/storage.service.js';

if (!env.isTest) throw new Error('Тесты должны запускаться с NODE_ENV=test');

// Тесты никогда не обращаются к реальному Supabase, даже если ключи заданы в .env:
// по умолчанию хранилище отключено, нужные наборы подключают in-memory драйвер.
setStorageDriver(null);

export const app = createApp();
export const api = () => request(app);
export { prisma };

let counter = 0;
const unique = () => `${Date.now().toString(36)}${(counter += 1)}`;

/** Полная очистка тестовой БД (только synq_test). */
export async function resetDb() {
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "orders", "products", "categories", "users" RESTART IDENTITY CASCADE');
}

export async function closeDb() {
  await resetDb();
  await prisma.$disconnect();
}

/** Регистрирует пользователя через API; для ADMIN роль выставляется напрямую в тестовой БД. */
export async function createUser({ role = 'USER', password = 'Passw0rd!' } = {}) {
  const email = `user_${unique()}@test.local`;
  const res = await api().post('/api/auth/register').send({ email, name: 'Test User', password });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`);
  let { user } = res.body.data;
  if (role === 'ADMIN') {
    user = await prisma.user.update({ where: { id: user.id }, data: { role: 'ADMIN' } });
  }
  return { user, token: res.body.data.token, email, password };
}

export const auth = (token) => ({ Authorization: `Bearer ${token}` });

export async function createCategory(adminToken, data = {}) {
  const res = await api()
    .post('/api/categories')
    .set(auth(adminToken))
    .send({ name: `Category ${unique()}`, ...data });
  if (res.status !== 201) throw new Error(`category failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
}

export async function createProduct(adminToken, categoryId, data = {}) {
  const res = await api()
    .post('/api/products')
    .set(auth(adminToken))
    .send({
      name: `Product ${unique()}`,
      description: 'Описание тестового товара для автотестов.',
      price: '49.90',
      categoryId,
      ...data,
    });
  if (res.status !== 201) throw new Error(`product failed: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data;
}

/** Изолированный in-memory драйвер Storage: тесты не обращаются к реальному Supabase. */
export function useMemoryStorage() {
  const objects = new Map();
  setStorageDriver({
    async upload(bucket, path, buffer) { objects.set(`${bucket}/${path}`, buffer); },
    async remove(bucket, paths) { paths.forEach((p) => objects.delete(`${bucket}/${p}`)); },
    publicUrl: (bucket, path) => `https://storage.test/${bucket}/${path}`,
    async signedUrl(bucket, path, ttl) { return `https://storage.test/signed/${bucket}/${path}?ttl=${ttl}`; },
  });
  return objects;
}

export function disableStorage() {
  setStorageDriver(null);
}

/** Проверяет, что хеш пароля нигде не встречается в теле ответа. */
export function assertNoPasswordHash(body) {
  const text = JSON.stringify(body);
  if (text.includes('passwordHash') || text.includes('password_hash') || /\$2[aby]\$\d{2}\$/.test(text)) {
    throw new Error(`passwordHash leaked in response: ${text.slice(0, 300)}`);
  }
}
