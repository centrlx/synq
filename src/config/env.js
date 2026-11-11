import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL обязателен'),
  TEST_DATABASE_URL: z.string().optional(),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET должен содержать не менее 32 символов'),
  JWT_EXPIRES_IN: z.string().default('12h'),
  CORS_ORIGIN: z.string().default('http://localhost:4000'),
  SUPABASE_URL: z.string().optional().default(''),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional().default(''),
  SUPABASE_IMAGES_BUCKET: z.string().default('product-images'),
  SUPABASE_FILES_BUCKET: z.string().default('product-files'),
  SIGNED_URL_TTL: z.coerce.number().int().min(10).max(3600).default(120),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const details = parsed.error.issues.map((i) => `  • ${i.path.join('.')}: ${i.message}`).join('\n');
  console.error(`\n[SYNQ] Некорректная конфигурация окружения (.env):\n${details}\n`);
  process.exit(1);
}

const raw = parsed.data;

// В тестовом режиме приложение работает только с отдельной тестовой БД,
// чтобы автотесты никогда не оставляли записей в рабочей базе.
if (raw.NODE_ENV === 'test') {
  if (!raw.TEST_DATABASE_URL) {
    console.error('[SYNQ] Для запуска тестов задайте TEST_DATABASE_URL в .env');
    process.exit(1);
  }
  if (raw.TEST_DATABASE_URL === raw.DATABASE_URL) {
    console.error('[SYNQ] TEST_DATABASE_URL не должен совпадать с DATABASE_URL');
    process.exit(1);
  }
}

export const env = {
  ...raw,
  isProduction: raw.NODE_ENV === 'production',
  isTest: raw.NODE_ENV === 'test',
  databaseUrl: raw.NODE_ENV === 'test' ? raw.TEST_DATABASE_URL : raw.DATABASE_URL,
  corsOrigins: raw.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean),
  storageConfigured: Boolean(raw.SUPABASE_URL && raw.SUPABASE_SERVICE_ROLE_KEY),
};
