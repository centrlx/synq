import { z } from 'zod';
import { prisma } from '../config/prisma.js';
import { ROLES } from '../constants/roles.js';
import { AppError } from '../utils/AppError.js';
import { buildMeta, getPagination } from '../utils/pagination.js';
import { psychPrice } from '../utils/pricing.js';
import { slugify } from '../utils/slugify.js';
import { categoryBriefSelect } from './selects.js';
import { ratingsFor, summary as reviewSummary } from './reviews.service.js';
import { serializeProduct } from './serializers.js';
import { removeObjects } from './storage.service.js';

const SORT_MAP = {
  newest: { createdAt: 'desc' },
  oldest: { createdAt: 'asc' },
  price_asc: { price: 'asc' },
  price_desc: { price: 'desc' },
  name_asc: { name: 'asc' },
  name_desc: { name: 'desc' },
};

const isAdmin = (viewer) => viewer?.role === ROLES.ADMIN;
const isUuid = (value) => z.uuid().safeParse(value).success;

const withCategory = { category: { select: categoryBriefSelect } };

async function assertCategoryExists(categoryId) {
  const category = await prisma.category.findUnique({ where: { id: categoryId }, select: { id: true } });
  if (!category) throw AppError.notFound('Указанная категория не существует', 'CATEGORY_NOT_FOUND');
}

/** Для автоматически сформированного slug подбирает свободный вариант: name, name-2, name-3… */
async function uniqueSlug(base, excludeId) {
  if (!base) throw AppError.badRequest('Не удалось сформировать slug из названия — укажите slug явно', 'INVALID_SLUG');
  let candidate = base;
  for (let i = 2; i < 1000; i += 1) {
    const found = await prisma.product.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!found || found.id === excludeId) return candidate;
    candidate = `${base}-${i}`;
  }
  throw AppError.conflict('Не удалось подобрать уникальный slug', 'SLUG_TAKEN');
}

async function assertSlugFree(slug, excludeId) {
  const found = await prisma.product.findUnique({ where: { slug }, select: { id: true } });
  if (found && found.id !== excludeId) throw AppError.conflict(`Товар со slug «${slug}» уже существует`, 'SLUG_TAKEN');
}

export async function listProducts(query, viewer) {
  const { skip, take, page } = getPagination(query);
  const where = {};

  // Гости и покупатели видят только активные товары, независимо от параметра status.
  const status = isAdmin(viewer) ? query.status : 'active';
  if (status === 'active') where.isActive = true;
  if (status === 'archived') where.isActive = false;

  if (query.search) {
    where.OR = [
      { name: { contains: query.search, mode: 'insensitive' } },
      { developer: { contains: query.search, mode: 'insensitive' } },
    ];
  }
  if (query.category) {
    where.category = isUuid(query.category) ? { id: query.category } : { slug: query.category };
  }
  if (query.platform) where.platforms = { has: query.platform };
  if (query.developer) where.developer = { equals: query.developer, mode: 'insensitive' };
  if (query.onSale === 'true') {
    // Действующая скидка: цена со скидкой задана и срок не истёк
    where.salePrice = { not: null };
    where.AND = [{ OR: [{ saleEndsAt: null }, { saleEndsAt: { gt: new Date() } }] }];
  }
  if (query.minPrice !== undefined || query.maxPrice !== undefined) {
    where.price = {};
    if (query.minPrice !== undefined) where.price.gte = query.minPrice;
    if (query.maxPrice !== undefined) where.price.lte = query.maxPrice;
  }

  const [total, products] = await prisma.$transaction([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      include: withCategory,
      orderBy: [SORT_MAP[query.sort] ?? SORT_MAP.newest, { id: 'asc' }],
      skip,
      take,
    }),
  ]);

  const ratings = await ratingsFor(products.map((p) => p.id));
  return {
    items: products.map((p) => ({ ...serializeProduct(p, viewer), ...(ratings.get(p.id) ?? { ratingAvg: 0, reviewsCount: 0 }) })),
    meta: buildMeta({ page, take, total }),
  };
}

/**
 * «Самое популярное»: score = оплаченные покупки × 20 + просмотры.
 * Кандидаты — лидеры по продажам и по просмотрам; товары без покупок и просмотров не попадают.
 */
export async function listPopular(limit, viewer) {
  const [sales, viewed] = await prisma.$transaction([
    prisma.order.groupBy({
      by: ['productId'], where: { status: 'PAID' }, _count: { _all: true },
      orderBy: { _count: { productId: 'desc' } }, take: 50,
    }),
    prisma.product.findMany({
      where: { isActive: true, viewsCount: { gt: 0 } }, select: { id: true }, orderBy: { viewsCount: 'desc' }, take: 50,
    }),
  ]);
  const salesById = new Map(sales.map((s) => [s.productId, s._count._all]));
  const ids = [...new Set([...salesById.keys(), ...viewed.map((v) => v.id)])];
  if (!ids.length) return [];

  const products = await prisma.product.findMany({ where: { id: { in: ids }, isActive: true }, include: withCategory });
  const ratings = await ratingsFor(products.map((p) => p.id));
  return products
    .map((p) => ({ product: p, sales: salesById.get(p.id) ?? 0, score: (salesById.get(p.id) ?? 0) * 20 + p.viewsCount }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ product, sales }) => ({
      ...serializeProduct(product, viewer),
      salesCount: sales,
      ...(ratings.get(product.id) ?? { ratingAvg: 0, reviewsCount: 0 }),
    }));
}

/** Учёт просмотра страницы товара (frontend вызывает один раз за сессию). */
export async function registerView(id) {
  const { count } = await prisma.product.updateMany({ where: { id, isActive: true }, data: { viewsCount: { increment: 1 } } });
  if (count === 0) throw AppError.notFound('Товар не найден');
  return { id, counted: true };
}

export async function getProduct(id, viewer) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: {
      category: { select: { ...categoryBriefSelect, description: true } },
      ...(isAdmin(viewer) ? { _count: { select: { orders: true } } } : {}),
    },
  });
  if (!product || (!product.isActive && !isAdmin(viewer))) throw AppError.notFound('Товар не найден');
  const rating = await reviewSummary({ productId: id });
  return { ...serializeProduct(product, viewer), ratingAvg: rating.average, reviewsCount: rating.count };
}

export async function createProduct(data, viewer) {
  await assertCategoryExists(data.categoryId);
  let slug;
  if (data.slug) {
    await assertSlugFree(data.slug);
    slug = data.slug;
  } else {
    slug = await uniqueSlug(slugify(data.name));
  }

  const product = await prisma.product.create({
    data: { ...data, slug },
    include: withCategory,
  });
  return serializeProduct(product, viewer);
}

function assertSaleBelowPrice(price, salePrice) {
  if (salePrice !== null && salePrice !== undefined && Number(salePrice) >= Number(price)) {
    throw AppError.badRequest('Цена со скидкой должна быть меньше обычной цены', 'INVALID_SALE_PRICE');
  }
}

export async function updateProduct(id, data, viewer) {
  const current = await prisma.product.findUnique({ where: { id }, select: { id: true, price: true, salePrice: true } });
  if (!current) throw AppError.notFound('Товар не найден');
  // Проверяем пару «цена — цена со скидкой» с учётом уже сохранённых значений
  assertSaleBelowPrice(data.price ?? current.price, data.salePrice !== undefined ? data.salePrice : current.salePrice);
  if (data.salePrice === null) data.saleEndsAt = null;
  if (data.categoryId) await assertCategoryExists(data.categoryId);
  if (data.slug) await assertSlugFree(data.slug, id);

  const product = await prisma.product.update({ where: { id }, data, include: withCategory });
  return serializeProduct(product, viewer);
}

/**
 * Удаление товара. Если по товару есть заказы — физическое удаление разрушило бы
 * историю покупок, поэтому товар архивируется (isActive=false) и остаётся доступным
 * для скачивания уже оплатившим покупателям.
 */
export async function deleteProduct(id) {
  const product = await prisma.product.findUnique({
    where: { id },
    include: { _count: { select: { orders: true } } },
  });
  if (!product) throw AppError.notFound('Товар не найден');

  if (product._count.orders > 0) {
    await prisma.product.update({ where: { id }, data: { isActive: false } });
    return { id, deleted: false, archived: true, reason: 'По товару есть заказы — он перенесён в архив' };
  }

  await prisma.product.delete({ where: { id } });
  await removeObjects({ imagePath: product.imagePath, filePath: product.filePath });
  return { id, deleted: true, archived: false };
}

/**
 * Массовая скидка в процентах для категории или всего каталога.
 * Цена со скидкой округляется вниз до «красивого» значения (…499 / …999).
 */
export async function applyBulkDiscount({ percent, categoryId, endsAt }) {
  if (categoryId) {
    const category = await prisma.category.findUnique({ where: { id: categoryId }, select: { id: true } });
    if (!category) throw AppError.notFound('Категория не найдена', 'CATEGORY_NOT_FOUND');
  }
  const products = await prisma.product.findMany({
    where: { isActive: true, price: { gt: 0 }, ...(categoryId ? { categoryId } : {}) },
    select: { id: true, price: true },
  });

  const updates = [];
  for (const p of products) {
    const price = Number(p.price);
    let sale = psychPrice(price * (1 - percent / 100), 'down');
    if (sale >= price) sale = Math.floor(price * (1 - percent / 100));
    if (sale <= 0 || sale >= price) continue;
    updates.push(prisma.product.update({
      where: { id: p.id },
      data: { salePrice: sale.toFixed(2), saleEndsAt: endsAt ?? null },
    }));
  }
  await prisma.$transaction(updates);
  return { updated: updates.length, skipped: products.length - updates.length };
}

/** Снять скидки с категории или со всего каталога. */
export async function clearDiscounts({ categoryId }) {
  const { count } = await prisma.product.updateMany({
    where: { salePrice: { not: null }, ...(categoryId ? { categoryId } : {}) },
    data: { salePrice: null, saleEndsAt: null },
  });
  return { cleared: count };
}
