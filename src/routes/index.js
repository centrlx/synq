import { Router } from 'express';
import { prisma } from '../config/prisma.js';
import { env } from '../config/env.js';
import authRoutes from './auth.routes.js';
import brandsRoutes from './brands.routes.js';
import reviewsRoutes from './reviews.routes.js';
import categoriesRoutes from './categories.routes.js';
import ordersRoutes from './orders.routes.js';
import productsRoutes from './products.routes.js';
import statsRoutes from './stats.routes.js';
import uploadsRoutes from './uploads.routes.js';
import usersRoutes from './users.routes.js';

const router = Router();

router.get('/health', async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ success: true, data: { status: 'ok', database: 'connected', storage: env.storageConfigured ? 'configured' : 'not_configured' } });
});

router.use('/auth', authRoutes);
router.use('/users', usersRoutes);
router.use('/categories', categoriesRoutes);
router.use('/products', productsRoutes);
router.use('/brands', brandsRoutes);
router.use('/reviews', reviewsRoutes);
router.use('/orders', ordersRoutes);
router.use('/uploads', uploadsRoutes);
router.use('/stats', statsRoutes);

export default router;
