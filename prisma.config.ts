import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Prisma 7: строка подключения и путь к сиду задаются здесь, а не в schema.prisma.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'node prisma/seed.js',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
