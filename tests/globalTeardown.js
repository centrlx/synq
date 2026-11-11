import dotenv from 'dotenv';
import { dropDatabase } from './testDatabase.js';

/** Удаляет временную тестовую базу после прогона тестов. */
export default async function globalTeardown() {
  dotenv.config({ quiet: true });
  await dropDatabase(process.env.TEST_DATABASE_URL);
}
