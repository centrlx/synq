import { ROLES } from '../constants/roles.js';
import { discountPercent, effectivePrice, isSaleActive } from '../utils/pricing.js';

const money = (value) => (value === null || value === undefined ? value : Number(value).toFixed(2));

/**
 * Товар для ответа API. Путь к приватному файлу (filePath) и путь изображения
 * в Storage видит только администратор; покупателю — лишь факт наличия файла.
 */
export function serializeProduct(product, viewer) {
  if (!product) return product;
  const { filePath, imagePath, price, salePrice, saleEndsAt, ...rest } = product;
  const result = { ...rest, price: money(price), hasFile: Boolean(filePath) };

  // Скидка: покупатель видит её, только пока она действует; администратор — всегда
  if (price !== undefined) {
    const onSale = isSaleActive(product);
    const isAdmin = viewer?.role === ROLES.ADMIN;
    result.onSale = onSale;
    result.finalPrice = money(effectivePrice(product));
    result.discountPercent = onSale ? discountPercent(price, salePrice) : 0;
    result.salePrice = onSale || isAdmin ? money(salePrice ?? null) : null;
    result.saleEndsAt = onSale || isAdmin ? (saleEndsAt ?? null) : null;
  }

  if (viewer?.role === ROLES.ADMIN) {
    if (filePath !== undefined) result.filePath = filePath;
    if (imagePath !== undefined) result.imagePath = imagePath;
  }
  return result;
}

export function serializeOrder(order, viewer) {
  if (!order) return order;
  const result = { ...order, priceAtPurchase: money(order.priceAtPurchase) };
  if (order.product) result.product = serializeProduct(order.product, viewer);
  return result;
}
