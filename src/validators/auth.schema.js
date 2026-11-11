import { z } from 'zod';
import { nonEmpty, paginationQuery } from './common.js';

const email = z.string().trim().toLowerCase().pipe(z.email('Некорректный email').max(254));

const password = z
  .string()
  .min(8, 'Пароль должен содержать не менее 8 символов')
  .max(72, 'Пароль не должен превышать 72 символа') // ограничение алгоритма bcrypt
  .regex(/[A-Za-zА-Яа-яЁё]/, 'Пароль должен содержать хотя бы одну букву')
  .regex(/\d/, 'Пароль должен содержать хотя бы одну цифру');

const name = z.string().trim().min(2, 'Имя должно содержать не менее 2 символов').max(80);

// strictObject: любые лишние поля (role, id, passwordHash…) отклоняются с 400.
export const registerSchema = z.strictObject({ email, name, password });

export const loginSchema = z.strictObject({
  email,
  password: z.string().min(1, 'Введите пароль').max(72),
});

export const updateMeSchema = nonEmpty(
  z.strictObject({
    name: name.optional(),
    currentPassword: z.string().min(1).max(72).optional(),
    newPassword: password.optional(),
  }),
).refine((d) => !d.newPassword || d.currentPassword, {
  message: 'Для смены пароля укажите текущий пароль',
  path: ['currentPassword'],
});

export const updateRoleSchema = z.strictObject({
  role: z.enum(['USER', 'ADMIN']),
});

export const usersQuery = z.object({
  ...paginationQuery,
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  role: z.enum(['USER', 'ADMIN']).optional(),
});
