/**
 * SYNQ seed.
 *
 * Сид НЕ создаёт товары, категории, заказы, отзывы или тестовых пользователей:
 * каталог наполняется только администратором через админ-панель или API.
 *
 * Единственное, что он умеет, — создать учётную запись владельца магазина (ADMIN),
 * если в окружении явно заданы ADMIN_EMAIL, ADMIN_NAME и ADMIN_PASSWORD.
 * Без этих переменных сид ничего не делает. Повторный запуск безопасен.
 */
import { prisma } from '../src/config/prisma.js';
import { ensureAdmin } from '../scripts/admin-core.js';

const { ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD } = process.env;

try {
  if (!ADMIN_EMAIL || !ADMIN_NAME || !ADMIN_PASSWORD) {
    console.log('[seed] ADMIN_EMAIL / ADMIN_NAME / ADMIN_PASSWORD не заданы — база не изменена.');
    console.log('[seed] Каталог пуст по замыслу: категории и товары добавляет администратор.');
  } else {
    const { user, created } = await ensureAdmin({ email: ADMIN_EMAIL, name: ADMIN_NAME, password: ADMIN_PASSWORD });
    console.log(created ? `[seed] Создан администратор ${user.email}` : `[seed] ${user.email} уже существует — роль ADMIN подтверждена`);
  }
} catch (err) {
  console.error('[seed] Ошибка:', err.issues ?? err.message);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
