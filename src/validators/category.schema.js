import { z } from 'zod';
import { nonEmpty, slugField } from './common.js';

const fields = {
  name: z.string().trim().min(2, 'Название должно содержать не менее 2 символов').max(80),
  slug: slugField.optional(),
  description: z.string().trim().max(1000).nullable().optional(),
};

export const createCategorySchema = z.strictObject(fields);

export const updateCategorySchema = nonEmpty(
  z.strictObject({
    name: fields.name.optional(),
    slug: fields.slug,
    description: fields.description,
  }),
);
