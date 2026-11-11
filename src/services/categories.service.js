import { prisma } from '../config/prisma.js';
import { ROLES } from '../constants/roles.js';
import { AppError } from '../utils/AppError.js';
import { buildMeta, getPagination } from '../utils/pagination.js';
import { slugify } from '../utils/slugify.js';
import { categoryBriefSelect } from './selects.js';
import { serializeProduct } from './serializers.js';

const activeOnly = { where: { isActive: true } };

async function ensureUniqueSlug(slug, excludeId) {
  const existing = await prisma.category.findUnique({ where: { slug }, select: { id: true } });
  if (existing && existing.id !== excludeId) {
    throw AppError.conflict(`Категория со slug «${slug}» уже существует`, 'SLUG_TAKEN');
  }
}

function resolveSlug(data) {
  const slug = data.slug ?? slugify(data.name);
  if (!slug) throw AppError.badRequest('Не удалось сформировать slug из названия — укажите slug явно', 'INVALID_SLUG');
  return slug;
}

export async function listCategories() {
  const categories = await prisma.category.findMany({
    orderBy: { name: 'asc' },
    include: { _count: { select: { products: activeOnly } } },
  });
  return categories.map(({ _count, ...c }) => ({ ...c, productsCount: _count.products }));
}

export async function getCategory(id) {
  const category = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { products: activeOnly } } },
  });
  if (!category) throw AppError.notFound('Категория не найдена');
  const { _count, ...rest } = category;
  return { ...rest, productsCount: _count.products };
}

/** Связанная выборка: категория + её товары (Prisma include с фильтром, сортировкой и пагинацией). */
export async function getCategoryProducts(id, query, viewer) {
  const { skip, take, page } = getPagination(query);
  const where = viewer?.role === ROLES.ADMIN ? {} : { isActive: true };

  const category = await prisma.category.findUnique({
    where: { id },
    include: {
      _count: { select: { products: { where } } },
      products: {
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
        include: { category: { select: categoryBriefSelect } },
      },
    },
  });
  if (!category) throw AppError.notFound('Категория не найдена');

  const { products, _count, ...rest } = category;
  return {
    category: rest,
    items: products.map((p) => serializeProduct(p, viewer)),
    meta: buildMeta({ page, take, total: _count.products }),
  };
}

export async function createCategory(data) {
  const slug = resolveSlug(data);
  await ensureUniqueSlug(slug);
  return prisma.category.create({
    data: { name: data.name, slug, description: data.description ?? null },
  });
}

export async function updateCategory(id, data) {
  const current = await prisma.category.findUnique({ where: { id }, select: { id: true } });
  if (!current) throw AppError.notFound('Категория не найдена');
  if (data.slug) await ensureUniqueSlug(data.slug, id);
  return prisma.category.update({ where: { id }, data });
}

export async function deleteCategory(id) {
  const category = await prisma.category.findUnique({
    where: { id },
    include: { _count: { select: { products: true } } },
  });
  if (!category) throw AppError.notFound('Категория не найдена');
  if (category._count.products > 0) {
    throw AppError.conflict(
      `В категории ${category._count.products} товар(ов). Перенесите или удалите их перед удалением категории`,
      'CATEGORY_NOT_EMPTY',
    );
  }
  await prisma.category.delete({ where: { id } });
  return { id, deleted: true };
}
