import { prisma } from '../config/prisma.js';

/**
 * Бренды (разработчики) каталога: агрегируются из поля developer активных товаров.
 * Для каждого бренда — число товаров и до трёх обложек для превью.
 */
export async function listBrands() {
  const [groups, withImages] = await prisma.$transaction([
    prisma.product.groupBy({
      by: ['developer'],
      where: { isActive: true, developer: { not: null } },
      _count: { _all: true },
      orderBy: { developer: 'asc' },
    }),
    prisma.product.findMany({
      where: { isActive: true, developer: { not: null }, imageUrl: { not: null } },
      select: { developer: true, imageUrl: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const images = new Map();
  for (const { developer, imageUrl } of withImages) {
    const list = images.get(developer) ?? [];
    if (list.length < 3) list.push(imageUrl);
    images.set(developer, list);
  }

  return groups
    .map((g) => ({ name: g.developer, productsCount: g._count._all, images: images.get(g.developer) ?? [] }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru', { sensitivity: 'base' }));
}
