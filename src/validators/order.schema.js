import { z } from 'zod';
import { paginationQuery } from './common.js';

// userId в теле НЕ принимается: владелец заказа — всегда пользователь из JWT.
export const createOrderSchema = z.strictObject({
  productId: z.uuid('Некорректный productId'),
});

// Оплата: только платёжная система и последние 4 цифры. Поля с полным номером/CVV отклоняются (strict)
export const payOrderSchema = z.strictObject({
  cardBrand: z.enum(['visa', 'mastercard', 'mir', 'amex', 'unionpay', 'card']),
  cardLast4: z.string().regex(/^\d{4}$/, 'Ожидаются последние 4 цифры карты'),
});

export const updateOrderStatusSchema = z.strictObject({
  status: z.enum(['PENDING', 'PAID', 'CANCELLED']),
});

export const ordersQuery = z.object({
  ...paginationQuery,
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['PENDING', 'PAID', 'CANCELLED']).optional(),
  userId: z.uuid().optional(), // фильтр для администратора
});

export const myOrdersQuery = z.object({
  ...paginationQuery,
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(['PENDING', 'PAID', 'CANCELLED']).optional(),
});
