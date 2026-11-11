import { execSync } from 'node:child_process';
import dotenv from 'dotenv';
import { createDatabase } from './testDatabase.js';

/**
 * Перед тестами создаёт ВРЕМЕННУЮ базу (TEST_DATABASE_URL) и применяет к ней миграции.
 * После тестов globalTeardown удаляет её. Рабочая база (DATABASE_URL) не затрагивается.
 */
export default async function globalSetup() {
  dotenv.config({ quiet: true });
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL не задан в .env');
  if (url === process.env.DATABASE_URL) throw new Error('TEST_DATABASE_URL совпадает с DATABASE_URL — тесты остановлены');

  await createDatabase(url);
  execSync('npx prisma migrate deploy', { stdio: 'pipe', env: { ...process.env, DATABASE_URL: url } });
}
