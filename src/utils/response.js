/** Единый формат успешного ответа: { success: true, data, meta? } */
export function ok(res, data, { status = 200, meta } = {}) {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(status).json(body);
}

export const created = (res, data) => ok(res, data, { status: 201 });
