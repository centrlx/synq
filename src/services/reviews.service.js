import { prisma } from '../config/prisma.js';
import { ORDER_STATUS, ROLES } from '../constants/roles.js';
import { AppError } from '../utils/AppError.js';
import { buildMeta, getPagination } from '../utils/pagination.js';

// Публично показываем только имя автора — без email и других данных
const reviewInclude = {
  user: { select: { id: true, name: true } },
  product: { select: { id: true, name: true, slug: true, imageUrl: true, developer: true } },
};

const SORTS = {
  newest: [{ createdAt: 'desc' }],
  best: [{ rating: 'desc' }, { createdAt: 'desc' }],
  worst: [{ rating: 'asc' }, { createdAt: 'desc' }],
};

/** Сводка: средняя оценка, количество и распределение по звёздам. */
export async function summary(where = {}) {
  const [agg, groups] = await prisma.$transaction([
    prisma.review.aggregate({ where, _avg: { rating: true }, _count: { _all: true } }),
    prisma.review.groupBy({ by: ['rating'], where, _count: { _all: true }, orderBy: { rating: 'desc' } }),
  ]);
  const distribution = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  for (const g of groups) distribution[g.rating] = g._count._all;
  return {
    average: agg._avg.rating ? Number(agg._avg.rating.toFixed(2)) : 0,
    count: agg._count._all,
    distribution,
  };
}

/** Рейтинг для набора товаров (для карточек каталога) одним запросом. */
export async function ratingsFor(productIds) {
  if (!productIds.length) return new Map();
  const rows = await prisma.review.groupBy({
    by: ['productId'],
    where: { productId: { in: productIds } },
    _avg: { rating: true },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.productId, { ratingAvg: Number((r._avg.rating ?? 0).toFixed(1)), reviewsCount: r._count._all }]));
}

async function listReviews(where, query) {
  const { skip, take, page } = getPagination(query);
  const filtered = query.rating ? { ...where, rating: query.rating } : where;
  const [total, items] = await prisma.$transaction([
    prisma.review.count({ where: filtered }),
    prisma.review.findMany({ where: filtered, include: reviewInclude, orderBy: SORTS[query.sort] ?? SORTS.newest, skip, take }),
  ]);
  return { items, meta: buildMeta({ page, take, total }), summary: await summary(where) };
}

export async function listProductReviews(productId, query) {
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (!product) throw AppError.notFound('Товар не найден');
  return listReviews({ productId }, query);
}

/** Лента всех отзывов магазина (страница «Отзывы»). */
export function listAllReviews(query) {
  return listReviews({}, query);
}

async function hasPaidOrder(userId, productId) {
  const order = await prisma.order.findFirst({ where: { userId, productId, status: ORDER_STATUS.PAID }, select: { id: true } });
  return Boolean(order);
}

/** Может ли пользователь оставить отзыв и его текущий отзыв (для страницы товара). */
export async function myReviewState(productId, viewer) {
  const [purchased, review] = await Promise.all([
    hasPaidOrder(viewer.id, productId),
    prisma.review.findUnique({ where: { userId_productId: { userId: viewer.id, productId } }, include: reviewInclude }),
  ]);
  return { purchased, canReview: purchased && !review, review };
}

export async function createReview(productId, viewer, data) {
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { id: true } });
  if (!product) throw AppError.notFound('Товар не найден');
  if (!(await hasPaidOrder(viewer.id, productId))) {
    throw AppError.forbidden('Оставить отзыв можно только после покупки товара', 'REVIEW_REQUIRES_PURCHASE');
  }
  const existing = await prisma.review.findUnique({ where: { userId_productId: { userId: viewer.id, productId } }, select: { id: true } });
  if (existing) throw AppError.conflict('Вы уже оставили отзыв на этот товар', 'ALREADY_REVIEWED');

  return prisma.review.create({ data: { ...data, userId: viewer.id, productId }, include: reviewInclude });
}

async function loadOwnReview(id, viewer, { allowAdmin = false } = {}) {
  const review = await prisma.review.findUnique({ where: { id }, select: { id: true, userId: true } });
  if (!review) throw AppError.notFound('Отзыв не найден');
  const isAdmin = viewer.role === ROLES.ADMIN;
  if (review.userId !== viewer.id && !(allowAdmin && isAdmin)) throw AppError.forbidden('Нет доступа к чужому отзыву');
  return review;
}

export async function updateReview(id, viewer, data) {
  await loadOwnReview(id, viewer);
  return prisma.review.update({ where: { id }, data, include: reviewInclude });
}

/** Удалить может автор или администратор (модерация). */
export async function deleteReview(id, viewer) {
  await loadOwnReview(id, viewer, { allowAdmin: true });
  await prisma.review.delete({ where: { id } });
  return { id, deleted: true };
}
