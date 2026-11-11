import { afterAll, beforeAll, describe, expect, test } from '@jest/globals';
import jwt from 'jsonwebtoken';
import { api, assertNoPasswordHash, auth, closeDb, createUser, prisma, resetDb } from './setup.js';

beforeAll(resetDb);
afterAll(closeDb);

describe('POST /api/auth/register', () => {
  test('1. регистрирует пользователя с ролью USER и выдаёт JWT', async () => {
    const res = await api()
      .post('/api/auth/register')
      .send({ email: 'Buyer@Example.com', name: 'Покупатель', password: 'Secret123' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user).toMatchObject({ email: 'buyer@example.com', name: 'Покупатель', role: 'USER' });
    expect(typeof res.body.data.token).toBe('string');
    assertNoPasswordHash(res.body);

    const stored = await prisma.user.findUnique({ where: { email: 'buyer@example.com' } });
    expect(stored.passwordHash).not.toBe('Secret123');
    expect(stored.passwordHash.startsWith('$2')).toBe(true);
  });

  test('2. повторный email → 409 EMAIL_TAKEN', async () => {
    const res = await api()
      .post('/api/auth/register')
      .send({ email: 'buyer@example.com', name: 'Другой', password: 'Secret123' });
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ success: false, error: expect.objectContaining({ code: 'EMAIL_TAKEN' }) });
  });

  test('3. попытка зарегистрироваться администратором отклоняется (400), админ не создаётся', async () => {
    const res = await api()
      .post('/api/auth/register')
      .send({ email: 'hacker@example.com', name: 'Hacker', password: 'Secret123', role: 'ADMIN' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(await prisma.user.findUnique({ where: { email: 'hacker@example.com' } })).toBeNull();
  });

  test('валидация полей и типов → 400 с деталями', async () => {
    const res = await api().post('/api/auth/register').send({ email: 'not-an-email', name: 1, password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.error.details.map((d) => d.field)).toEqual(expect.arrayContaining(['email', 'name', 'password']));
  });

  test('некорректный JSON → 400 INVALID_JSON', async () => {
    const res = await api().post('/api/auth/register').set('Content-Type', 'application/json').send('{"email":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('INVALID_JSON');
  });
});

describe('POST /api/auth/login', () => {
  test('4. вход с верными данными → 200 + JWT', async () => {
    const res = await api().post('/api/auth/login').send({ email: 'buyer@example.com', password: 'Secret123' });
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe('buyer@example.com');
    const payload = jwt.decode(res.body.data.token);
    expect(payload.sub).toBe(res.body.data.user.id);
    expect(payload.role).toBe('USER');
    assertNoPasswordHash(res.body);
  });

  test('5. неверный пароль → 401 INVALID_CREDENTIALS', async () => {
    const res = await api().post('/api/auth/login').send({ email: 'buyer@example.com', password: 'Wrong1234' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });

  test('несуществующий email → тот же ответ 401 (не раскрывает наличие аккаунта)', async () => {
    const res = await api().post('/api/auth/login').send({ email: 'nobody@example.com', password: 'Secret123' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
  });
});

describe('GET /api/auth/me', () => {
  test('6. без JWT → 401', async () => {
    const res = await api().get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  test('7. недействительный JWT → 401 INVALID_TOKEN', async () => {
    const res = await api().get('/api/auth/me').set(auth('invalid.token.value'));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  test('JWT, подписанный чужим ключом → 401', async () => {
    const forged = jwt.sign({ role: 'ADMIN' }, 'attacker-secret-attacker-secret-attacker', { subject: 'x', issuer: 'synq-api' });
    const res = await api().get('/api/auth/me').set(auth(forged));
    expect(res.status).toBe(401);
  });

  test('с действительным JWT → профиль без passwordHash', async () => {
    const { token, user } = await createUser();
    const res = await api().get('/api/auth/me').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(user.id);
    assertNoPasswordHash(res.body);
  });
});
