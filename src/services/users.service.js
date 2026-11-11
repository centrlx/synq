import bcrypt from 'bcrypt';
import { prisma } from '../config/prisma.js';
import { ROLES } from '../constants/roles.js';
import { AppError } from '../utils/AppError.js';
import { buildMeta, getPagination } from '../utils/pagination.js';
import { BCRYPT_ROUNDS } from './auth.service.js';
import { publicUserSelect } from './selects.js';

const listSelect = { ...publicUserSelect, _count: { select: { orders: true } } };

export async function listUsers(query) {
  const { skip, take, page } = getPagination(query);
  const where = {};
  if (query.role) where.role = query.role;
  if (query.search) {
    where.OR = [
      { email: { contains: query.search, mode: 'insensitive' } },
      { name: { contains: query.search, mode: 'insensitive' } },
    ];
  }

  const [total, items] = await prisma.$transaction([
    prisma.user.count({ where }),
    prisma.user.findMany({ where, select: listSelect, orderBy: { createdAt: 'desc' }, skip, take }),
  ]);

  return { items, meta: buildMeta({ page, take, total }) };
}

export async function getUserById(id, viewer) {
  if (viewer.role !== ROLES.ADMIN && viewer.id !== id) {
    throw AppError.forbidden('Просматривать можно только собственный профиль');
  }
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      ...listSelect,
      // Связанная выборка: последние заказы пользователя с товаром
      orders: {
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          status: true,
          priceAtPurchase: true,
          createdAt: true,
          product: { select: { id: true, name: true, slug: true } },
        },
      },
    },
  });
  if (!user) throw AppError.notFound('Пользователь не найден');
  return { ...user, orders: user.orders.map((o) => ({ ...o, priceAtPurchase: Number(o.priceAtPurchase).toFixed(2) })) };
}

export async function updateMe(userId, { name, currentPassword, newPassword }) {
  const data = {};
  if (name !== undefined) data.name = name;

  if (newPassword) {
    const record = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    const valid = record && (await bcrypt.compare(currentPassword, record.passwordHash));
    if (!valid) throw AppError.badRequest('Текущий пароль указан неверно', 'INVALID_CURRENT_PASSWORD');
    data.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  }

  if (Object.keys(data).length === 0) {
    throw AppError.badRequest('Нет изменений для сохранения', 'NOTHING_TO_UPDATE');
  }

  return prisma.user.update({ where: { id: userId }, data, select: publicUserSelect });
}

export async function updateRole(targetId, role, admin) {
  if (targetId === admin.id) {
    throw AppError.conflict('Нельзя изменить собственную роль', 'SELF_ROLE_CHANGE');
  }
  const target = await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } });
  if (!target) throw AppError.notFound('Пользователь не найден');

  return prisma.user.update({ where: { id: targetId }, data: { role }, select: publicUserSelect });
}
