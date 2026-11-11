import { z } from 'zod';
import { nonEmpty, paginationQuery, slugField } from './common.js';

export const PLATFORMS = ['macOS', 'Windows', 'Linux'];
export const SORTS = ['newest', 'oldest', 'price_asc', 'price_desc', 'name_asc', 'name_desc'];

// Цена принимается числом или строкой ("49.90"), хранится как Decimal(10,2).
const price = z
  .union([z.number(), z.string().trim().regex(/^\d+(\.\d{1,2})?$/, 'Цена должна быть числом с не более чем 2 знаками после запятой')])
  .transform((v) => Number(v))
  .pipe(
    z
      .number()
      .min(0, 'Цена не может быть отрицательной')
      .max(99_999_999.99)
      .refine((n) => Number.isInteger(Math.round(n * 100)) && Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'Не более 2 знаков после запятой'),
  )
  .transform((n) => n.toFixed(2));

const shortText = (max) => z.string().trim().min(1).max(max);

const fields = {
  name: z.string().trim().min(2, 'Название должно содержать не менее 2 символов').max(120),
  slug: slugField.max(140).optional(),
  description: z.string().trim().min(10, 'Описание должно содержать не менее 10 символов').max(5000),
  price,
  categoryId: z.uuid('Некорректный categoryId'),
  developer: shortText(80).nullable().optional(),
  version: shortText(30).nullable().optional(),
  formats: z.array(shortText(20)).max(10).optional(),
  platforms: z.array(z.enum(PLATFORMS)).max(PLATFORMS.length).optional(),
  stock: z.number().int().min(0).max(1_000_000).nullable().optional(),
  isActive: z.boolean().optional(),
  // Скидка: цена со скидкой (null — снять скидку) и дата окончания (null — бессрочно)
  salePrice: price.nullable().optional(),
  saleEndsAt: z.union([z.null(), z.coerce.date('Некорректная дата окончания скидки')]).optional(),
};

const saleBelowPrice = (d) => d.salePrice === undefined || d.salePrice === null || d.price === undefined || Number(d.salePrice) < Number(d.price);
const saleRule = { message: 'Цена со скидкой должна быть меньше обычной цены', path: ['salePrice'] };

export const createProductSchema = z.strictObject(fields).refine(saleBelowPrice, saleRule);

export const updateProductSchema = nonEmpty(
  z.strictObject({
    name: fields.name.optional(),
    slug: fields.slug,
    description: fields.description.optional(),
    price: fields.price.optional(),
    categoryId: fields.categoryId.optional(),
    developer: fields.developer,
    version: fields.version,
    formats: fields.formats,
    platforms: fields.platforms,
    stock: fields.stock,
    isActive: fields.isActive,
    salePrice: fields.salePrice,
    saleEndsAt: fields.saleEndsAt,
  }).refine(saleBelowPrice, saleRule),
);

// Массовая скидка: процент от цены для категории или всего каталога
export const bulkDiscountSchema = z.strictObject({
  percent: z.number().int().min(1, 'Скидка от 1%').max(95, 'Скидка не больше 95%'),
  categoryId: z.uuid().nullable().optional(),
  endsAt: z.union([z.null(), z.coerce.date('Некорректная дата окончания')]).optional(),
});

export const clearDiscountQuery = z.object({
  categoryId: z.uuid().optional(),
});

const numberish = z.coerce.number().min(0).optional();

export const productsQuery = z
  .object({
    ...paginationQuery,
    search: z.string().trim().max(100).optional(),
    category: z.string().trim().max(100).optional(), // UUID или slug категории
    sort: z.enum(SORTS).default('newest'),
    minPrice: numberish,
    maxPrice: numberish,
    platform: z.enum(PLATFORMS).optional(),
    developer: z.string().trim().min(1).max(80).optional(), // бренд (точное совпадение без учёта регистра)
    status: z.enum(['active', 'archived', 'all']).default('active'), // archived/all — только для ADMIN
    onSale: z.enum(['true', 'false']).optional(), // только товары с действующей скидкой
  })
  .refine((q) => q.minPrice === undefined || q.maxPrice === undefined || q.minPrice <= q.maxPrice, {
    message: 'minPrice не может быть больше maxPrice',
    path: ['minPrice'],
  });
