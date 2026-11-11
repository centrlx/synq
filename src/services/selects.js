/**
 * Prisma select-проекции. passwordHash не входит ни в одну из них —
 * хеш пароля физически не может попасть в ответ API.
 */
export const publicUserSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  createdAt: true,
  updatedAt: true,
};

export const categoryBriefSelect = { id: true, name: true, slug: true };

export const productBriefSelect = {
  id: true,
  name: true,
  slug: true,
  price: true,
  salePrice: true,
  saleEndsAt: true,
  imageUrl: true,
  developer: true,
  isActive: true,
  fileName: true,
  filePath: true,
};
