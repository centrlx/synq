import { env } from './config/env.js';
import { prisma } from './config/prisma.js';
import { createApp } from './app.js';

async function start() {
  try {
    await prisma.$connect();
    await prisma.$queryRaw`SELECT 1`;
  } catch (err) {
    console.error('[SYNQ] Не удалось подключиться к PostgreSQL. Проверьте DATABASE_URL в .env.');
    console.error(`        ${err.message}`);
    process.exit(1);
  }

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    console.log(`[SYNQ] API:      http://localhost:${env.PORT}/api`);
    console.log(`[SYNQ] Frontend: http://localhost:${env.PORT}`);
    console.log(`[SYNQ] Storage:  ${env.storageConfigured ? 'Supabase подключён' : 'не настроен (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)'}`);
  });

  const shutdown = async (signal) => {
    console.log(`\n[SYNQ] ${signal}: завершение работы…`);
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

start();
