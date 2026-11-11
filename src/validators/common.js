import { z } from 'zod';

// Сообщения Zod по умолчанию — на русском языке.
z.config(z.locales.ru());

export const idParams = z.object({
  id: z.uuid('Некорректный идентификатор (ожидается UUID)'),
});

export const paginationQuery = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(12),
};

export const slugField = z
  .string()
  .trim()
  .min(2)
  .max(100)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Slug может содержать только латиницу в нижнем регистре, цифры и дефисы');

/** Требует хотя бы одно поле в PATCH-запросе. */
export const nonEmpty = (schema) =>
  schema.refine((obj) => Object.keys(obj).length > 0, { message: 'Передайте хотя бы одно поле для изменения' });
