export function getPagination({ page = 1, limit = 12 }) {
  const take = Math.min(Math.max(Number(limit) || 12, 1), 100);
  const current = Math.max(Number(page) || 1, 1);
  return { skip: (current - 1) * take, take, page: current };
}

export function buildMeta({ page, take, total }) {
  return {
    page,
    limit: take,
    total,
    totalPages: Math.max(Math.ceil(total / take), 1),
  };
}
