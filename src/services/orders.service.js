import { prisma } from '../config/prisma.js';
import { ORDER_STATUS, ROLES } from '../constants/roles.js';
import { AppError } from '../utils/AppError.js';
import { buildMeta, getPagination } from '../utils/pagination.js';
import { effectivePrice } from '../utils/pricing.js';
import { categoryBriefSelect, productBriefSelect } from './selects.js';
import { serializeOrder } from './serializers.js';
import { charge } from './payments.service.js';
import { createDownloadUrl } from './storage.service.js';

const isAdmin = (viewer) => viewer.role === ROLES.ADMIN;

const orderInclude = {
  product: { select: { ...productBriefSelect, category: { select: categoryBriefSelect } } },
};
const adminOrderInclude = {
  ...orderInclude,
  user: { select: { id: true, name: true, email: true } },
};

/** Допустимые переходы статусов. CANCELLED — конечный статус. */
const TRANSITIONS = {
  PENDING: ['PAID', 'CANCELLED'],
  PAID: ['CANCELLED'],
  CANCELLED: [],
};

export async function createOrder(user, { productId }) {
  const order = await prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({ where: { id: productId } });
    if (!product || !product.isActive) throw AppError.notFound('Товар не найден или снят с продажи', 'PRODUCT_NOT_FOUND');

    const duplicate = await tx.order.findFirst({
      where: { userId: user.id, productId, status: { in: [ORDER_STATUS.PENDING, ORDER_STATUS.PAID] } },
      select: { status: true },
    });
    if (duplicate) {
      throw AppError.conflict(
        duplicate.status === ORDER_STATUS.PAID ? 'Этот товар уже куплен' : 'Заказ на этот товар уже ожидает оплаты',
        'ALREADY_ORDERED',
      );
    }

    // Атомарное резервирование лицензии: условный UPDATE исключает уход остатка в минус.
    if (product.stock !== null) {
      const reserved = await tx.product.updateMany({
        where: { id: productId, stock: { gt: 0 } },
        data: { stock: { decrement: 1 } },
      });
      if (reserved.count === 0) throw AppError.conflict('Лицензии на этот товар закончились', 'OUT_OF_STOCK');
    }

    // Владелец — пользователь из JWT, цена — из БД (с учётом действующей скидки).
    // Клиент не влияет ни на то, ни на другое.
    return tx.order.create({
      data: { userId: user.id, productId, priceAtPurchase: effectivePrice(product).toFixed(2) },
      include: orderInclude,
    });
  });

  return serializeOrder(order, user);
}

export async function listMyOrders(user, query) {
  const { skip, take, page } = getPagination(query);
  const where = { userId: user.id, ...(query.status ? { status: query.status } : {}) };
  const [total, orders] = await prisma.$transaction([
    prisma.order.count({ where }),
    prisma.order.findMany({ where, include: orderInclude, orderBy: { createdAt: 'desc' }, skip, take }),
  ]);
  return { items: orders.map((o) => serializeOrder(o, user)), meta: buildMeta({ page, take, total }) };
}

export async function listAllOrders(query, viewer) {
  const { skip, take, page } = getPagination(query);
  const where = {};
  if (query.status) where.status = query.status;
  if (query.userId) where.userId = query.userId;
  const [total, orders] = await prisma.$transaction([
    prisma.order.count({ where }),
    prisma.order.findMany({ where, include: adminOrderInclude, orderBy: { createdAt: 'desc' }, skip, take }),
  ]);
  return { items: orders.map((o) => serializeOrder(o, viewer)), meta: buildMeta({ page, take, total }) };
}

async function loadAccessibleOrder(id, viewer, include = orderInclude) {
  const order = await prisma.order.findUnique({ where: { id }, include });
  if (!order) throw AppError.notFound('Заказ не найден');
  if (!isAdmin(viewer) && order.userId !== viewer.id) {
    throw AppError.forbidden('Нет доступа к чужому заказу');
  }
  return order;
}

export async function getOrder(id, viewer) {
  const order = await loadAccessibleOrder(id, viewer, isAdmin(viewer) ? adminOrderInclude : orderInclude);
  return serializeOrder(order, viewer);
}

export async function updateOrderStatus(id, status, viewer) {
  const order = await loadAccessibleOrder(id, viewer);

  // Покупатель может только отменить свой неоплаченный заказ.
  if (!isAdmin(viewer) && !(order.status === ORDER_STATUS.PENDING && status === ORDER_STATUS.CANCELLED)) {
    throw AppError.forbidden('Покупатель может только отменить неоплаченный заказ');
  }
  if (!TRANSITIONS[order.status].includes(status)) {
    throw AppError.conflict(`Переход статуса ${order.status} → ${status} недопустим`, 'INVALID_STATUS_TRANSITION');
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (status === ORDER_STATUS.PAID) {
      // Ручное подтверждение оплаты администратором
      await tx.order.update({ where: { id }, data: { paidAt: new Date(), paymentRef: `MANUAL-${id.slice(0, 8).toUpperCase()}` } });
    }
    if (status === ORDER_STATUS.CANCELLED) {
      // Возврат зарезервированной лицензии в остаток (если остаток ограничен).
      await tx.product.updateMany({
        where: { id: order.productId, stock: { not: null } },
        data: { stock: { increment: 1 } },
      });
    }
    return tx.order.update({
      where: { id },
      data: { status },
      include: isAdmin(viewer) ? adminOrderInclude : orderInclude,
    });
  });

  return serializeOrder(updated, viewer);
}

/** Оплата заказа картой через платёжный шлюз. Платить может только владелец заказа. */
export async function payOrder(id, viewer, card) {
  const order = await prisma.order.findUnique({ where: { id }, select: { id: true, userId: true, status: true, priceAtPurchase: true } });
  if (!order) throw AppError.notFound('Заказ не найден');
  if (order.userId !== viewer.id) throw AppError.forbidden('Оплатить можно только собственный заказ');
  if (order.status === ORDER_STATUS.PAID) throw AppError.conflict('Заказ уже оплачен', 'ALREADY_PAID');
  if (order.status !== ORDER_STATUS.PENDING) throw AppError.conflict('Отменённый заказ нельзя оплатить', 'ORDER_NOT_PENDING');

  const payment = await charge({ amount: order.priceAtPurchase, ...card });

  // Условие status = PENDING защищает от двойной оплаты при параллельных запросах
  const { count } = await prisma.order.updateMany({
    where: { id, status: ORDER_STATUS.PENDING },
    data: {
      status: ORDER_STATUS.PAID,
      paidAt: payment.authorizedAt,
      paymentRef: payment.ref,
      cardBrand: payment.cardBrand,
      cardLast4: payment.cardLast4,
    },
  });
  if (count === 0) throw AppError.conflict('Статус заказа изменился во время оплаты', 'ORDER_NOT_PENDING');

  const paid = await prisma.order.findUnique({ where: { id }, include: orderInclude });
  return serializeOrder(paid, viewer);
}

/** Выдача ссылки на скачивание: только владельцу (или администратору) и только оплаченного заказа. */
export async function getDownloadLink(id, viewer) {
  const order = await prisma.order.findUnique({
    where: { id },
    include: { product: { select: { filePath: true, fileName: true } } },
  });
  if (!order) throw AppError.notFound('Заказ не найден');
  if (!isAdmin(viewer) && order.userId !== viewer.id) throw AppError.forbidden('Нет доступа к чужому заказу');
  if (order.status !== ORDER_STATUS.PAID) {
    throw AppError.forbidden('Скачивание доступно только после оплаты заказа', 'ORDER_NOT_PAID');
  }
  if (!order.product.filePath) {
    throw AppError.notFound('Файл товара ещё не загружен продавцом', 'FILE_NOT_AVAILABLE');
  }
  return createDownloadUrl(order.product.filePath, order.product.fileName);
}
