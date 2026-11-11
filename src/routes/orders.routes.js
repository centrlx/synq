import { Router } from 'express';
import { ROLES } from '../constants/roles.js';
import * as orders from '../controllers/orders.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import { idParams } from '../validators/common.js';
import {
  createOrderSchema, myOrdersQuery, ordersQuery, payOrderSchema, updateOrderStatusSchema,
} from '../validators/order.schema.js';

const router = Router();

router.use(requireAuth);

router.post('/', validate({ body: createOrderSchema }), orders.create);
router.get('/my', validate({ query: myOrdersQuery }), orders.listMine);
router.get('/', requireRole(ROLES.ADMIN), validate({ query: ordersQuery }), orders.listAll);
router.get('/:id', validate({ params: idParams }), orders.getById);
router.patch('/:id/status', validate({ params: idParams, body: updateOrderStatusSchema }), orders.updateStatus);
router.post('/:id/pay', validate({ params: idParams, body: payOrderSchema }), orders.pay);
router.get('/:id/download', validate({ params: idParams }), orders.download);

export default router;
