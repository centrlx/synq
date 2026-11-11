import bcrypt from 'bcrypt';
import { prisma } from '../src/config/prisma.js';
import { BCRYPT_ROUNDS } from '../src/services/auth.service.js';
import { loginSchema, registerSchema } from '../src/validators/auth.schema.js';

/**
 * Создаёт администратора или повышает существующего пользователя до ADMIN.
 * Единственный способ получить роль ADMIN, кроме назначения другим администратором.
 */
export async function ensureAdmin({ email, name, password }) {
  const existing = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });

  if (existing) {
    loginSchema.parse({ email, password: 'x' });
    const user = await prisma.user.update({
      where: { id: existing.id },
      data: { role: 'ADMIN' },
      select: { id: true, email: true, name: true, role: true },
    });
    return { user, created: false };
  }

  const data = registerSchema.parse({ email, name, password });
  const user = await prisma.user.create({
    data: { email: data.email, name: data.name, role: 'ADMIN', passwordHash: await bcrypt.hash(data.password, BCRYPT_ROUNDS) },
    select: { id: true, email: true, name: true, role: true },
  });
  return { user, created: true };
}
