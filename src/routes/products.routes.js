import { Router } from 'express';
import { ROLES } from '../constants/roles.js';
import * as products from '../controllers/products.controller.js';
import * as reviews from '../controllers/reviews.controller.js';
import { optionalAuth, requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import { idParams } from '../validators/common.js';
import {
  bulkDiscountSchema, clearDiscountQuery, createProductSchema, productsQuery, updateProductSchema,
} from '../validators/product.schema.js';
import { createReviewSchema, reviewsQuery } from '../validators/review.schema.js';
import { z } from 'zod';

const router = Router();
const adminOnly = [requireAuth, requireRole(ROLES.ADMIN)];

// optionalAuth: гость видит активные товары, администратор — также архив.
router.get('/', optionalAuth, validate({ query: productsQuery }), products.list);
// Массовые скидки — объявлены до маршрутов с :id
router.post('/discounts', ...adminOnly, validate({ body: bulkDiscountSchema }), products.bulkDiscount);
router.delete('/discounts', ...adminOnly, validate({ query: clearDiscountQuery }), products.clearDiscounts);
// «Самое популярное»: оплаченные покупки + просмотры
router.get('/popular', optionalAuth, validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(24).default(8) }) }), products.popular);
router.post('/:id/view', validate({ params: idParams }), products.view);
// Отзывы товара
router.get('/:id/reviews', validate({ params: idParams, query: reviewsQuery }), reviews.listForProduct);
router.get('/:id/reviews/me', requireAuth, validate({ params: idParams }), reviews.mine);
router.post('/:id/reviews', requireAuth, validate({ params: idParams, body: createReviewSchema }), reviews.create);
router.get('/:id', optionalAuth, validate({ params: idParams }), products.getById);
router.post('/', ...adminOnly, validate({ body: createProductSchema }), products.create);
router.patch('/:id', ...adminOnly, validate({ params: idParams, body: updateProductSchema }), products.update);
router.delete('/:id', ...adminOnly, validate({ params: idParams }), products.remove);

export default router;
