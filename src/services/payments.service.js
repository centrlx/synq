import crypto from 'node:crypto';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

/**
 * Платёжный шлюз SYNQ (эмуляция эквайринга).
 * На сервер приходят только платёжная система и последние 4 цифры карты —
 * полный номер, срок действия и CVV остаются в браузере покупателя.
 * Карта, оканчивающаяся на 0002, отклоняется банком (сценарий отказа).
 */
const PROCESSING_MS = 1200;
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

export async function charge({ amount, cardBrand, cardLast4 }) {
  if (!env.isTest) await sleep(PROCESSING_MS);

  if (cardLast4 === '0002') {
    throw new AppError(402, 'PAYMENT_DECLINED', 'Банк отклонил операцию. Попробуйте другую карту');
  }

  return {
    ref: `SQ-${crypto.randomBytes(6).toString('hex').toUpperCase()}`,
    amount,
    cardBrand,
    cardLast4,
    authorizedAt: new Date(),
  };
}
