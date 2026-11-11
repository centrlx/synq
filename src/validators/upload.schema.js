import { z } from 'zod';

export const uploadTargetSchema = z.object({
  productId: z.uuid('Передайте корректный productId товара, к которому относится файл'),
});

export const productIdParams = z.object({
  productId: z.uuid('Некорректный productId'),
});
