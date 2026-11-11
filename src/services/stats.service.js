import { prisma } from '../config/prisma.js';

/** Реальная статистика магазина — только агрегаты из PostgreSQL, без демонстрационных чисел. */
export async function getStats() {
  const [
    usersTotal,
    adminsTotal,
    categoriesTotal,
    productsActive,
    productsArchived,
    ordersByStatus,
    revenue,
    recentOrders,
    topProducts,
  ] = await prisma.$transaction([
    prisma.user.count(),
    prisma.user.count({ where: { role: 'ADMIN' } }),
    prisma.category.count(),
    prisma.product.count({ where: { isActive: true } }),
    prisma.product.count({ where: { isActive: false } }),
    prisma.order.groupBy({ by: ['status'], _count: { _all: true }, orderBy: { status: 'asc' } }),
    prisma.order.aggregate({ where: { status: 'PAID' }, _sum: { priceAtPurchase: true } }),
    prisma.order.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, email: true } },
        product: { select: { id: true, name: true } },
      },
    }),
    prisma.order.groupBy({
      by: ['productId'],
      where: { status: 'PAID' },
      _count: { _all: true },
      _sum: { priceAtPurchase: true },
      orderBy: { _count: { productId: 'desc' } },
      take: 5,
    }),
  ]);

  const status = { PENDING: 0, PAID: 0, CANCELLED: 0 };
  for (const row of ordersByStatus) status[row.status] = row._count._all;

  const names = await prisma.product.findMany({
    where: { id: { in: topProducts.map((t) => t.productId) } },
    select: { id: true, name: true },
  });
  const nameById = Object.fromEntries(names.map((n) => [n.id, n.name]));

  return {
    users: { total: usersTotal, admins: adminsTotal },
    categories: { total: categoriesTotal },
    products: { active: productsActive, archived: productsArchived, total: productsActive + productsArchived },
    orders: { ...status, total: status.PENDING + status.PAID + status.CANCELLED },
    revenue: Number(revenue._sum.priceAtPurchase ?? 0).toFixed(2),
    recentOrders: recentOrders.map((o) => ({ ...o, priceAtPurchase: Number(o.priceAtPurchase).toFixed(2) })),
    topProducts: topProducts.map((t) => ({
      productId: t.productId,
      name: nameById[t.productId] ?? '—',
      sales: t._count._all,
      revenue: Number(t._sum.priceAtPurchase ?? 0).toFixed(2),
    })),
  };
}
