import { Router } from 'express';
import { z } from 'zod';
import { ROLES } from '../constants/roles.js';
import * as categories from '../controllers/categories.controller.js';
import { optionalAuth, requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import { createCategorySchema, updateCategorySchema } from '../validators/category.schema.js';
import { idParams, paginationQuery } from '../validators/common.js';

const router = Router();
const adminOnly = [requireAuth, requireRole(ROLES.ADMIN)];

router.get('/', categories.list);
router.get('/:id', validate({ params: idParams }), categories.getById);
router.get('/:id/products', optionalAuth, validate({ params: idParams, query: z.object(paginationQuery) }), categories.products);
router.post('/', ...adminOnly, validate({ body: createCategorySchema }), categories.create);
router.patch('/:id', ...adminOnly, validate({ params: idParams, body: updateCategorySchema }), categories.update);
router.delete('/:id', ...adminOnly, validate({ params: idParams }), categories.remove);

export default router;
