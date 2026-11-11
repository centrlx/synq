import pg from 'pg';

/**
 * Временная тестовая база: создаётся перед автотестами и удаляется после них.
 * Постоянная тестовая база не нужна — в рабочую базу тесты не пишут никогда.
 */
export function parseTestUrl(url) {
  const parsed = new URL(url);
  const database = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  // Защита от ошибки в .env: удалять разрешено только базу с суффиксом _test
  if (!/^[a-z0-9_]+_test$/i.test(database)) {
    throw new Error(`Имя тестовой БД должно оканчиваться на _test (сейчас: «${database}»)`);
  }
  parsed.pathname = '/postgres';
  parsed.search = '';
  return { database, adminUrl: parsed.toString() };
}

export async function withAdminClient(adminUrl, fn) {
  const client = new pg.Client({ connectionString: adminUrl });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function dropDatabase(url) {
  const { database, adminUrl } = parseTestUrl(url);
  await withAdminClient(adminUrl, (c) => c.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`));
}

export async function createDatabase(url) {
  const { database, adminUrl } = parseTestUrl(url);
  await withAdminClient(adminUrl, async (c) => {
    await c.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
    await c.query(`CREATE DATABASE "${database}"`);
  });
}
