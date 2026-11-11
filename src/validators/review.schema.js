import { z } from 'zod';
import { nonEmpty, paginationQuery } from './common.js';

const rating = z.number().int().min(1, 'Оценка от 1 до 5').max(5, 'Оценка от 1 до 5');
const text = z.string().trim().min(10, 'Отзыв должен содержать не менее 10 символов').max(2000);

export const createReviewSchema = z.strictObject({ rating, text });
export const updateReviewSchema = nonEmpty(z.strictObject({ rating: rating.optional(), text: text.optional() }));

export const reviewsQuery = z.object({
  ...paginationQuery,
  limit: z.coerce.number().int().min(1).max(50).default(12),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  sort: z.enum(['newest', 'best', 'worst']).default('newest'),
});
