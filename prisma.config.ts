import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Prisma 7: строка подключения и путь к сиду задаются здесь, а не в schema.prisma.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node prisma/seed.js',
  },
  datasource: {
    // Не env(): иначе `npm install` (postinstall → prisma generate) падает,
    // пока .env ещё не создан. Генерации клиента строка подключения не нужна.
    url: process.env.DATABASE_URL ?? '',
  },
});
