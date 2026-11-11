/**
 * Ценообразование SYNQ (тенге).
 * Скидка задаётся ценой со скидкой (salePrice) и необязательной датой окончания (saleEndsAt).
 */

export function isSaleActive(product, now = new Date()) {
  if (product.salePrice === null || product.salePrice === undefined) return false;
  if (product.saleEndsAt && new Date(product.saleEndsAt) <= now) return false;
  return Number(product.salePrice) < Number(product.price);
}

/** Цена, по которой товар продаётся прямо сейчас. */
export function effectivePrice(product, now = new Date()) {
  return isSaleActive(product, now) ? Number(product.salePrice) : Number(product.price);
}

export function discountPercent(price, salePrice) {
  const p = Number(price);
  if (!p) return 0;
  return Math.round((1 - Number(salePrice) / p) * 100);
}

/**
 * «Красивая» цена: ближайшее значение, оканчивающееся на 499 или 999
 * (все такие числа имеют вид n·500 − 1). mode: 'nearest' | 'down'.
 */
export function psychPrice(value, mode = 'nearest') {
  const v = Number(value);
  if (v <= 0) return 0;
  const n = mode === 'down' ? Math.floor((v + 1) / 500) : Math.round((v + 1) / 500);
  return Math.max(n, 1) * 500 - 1;
}
