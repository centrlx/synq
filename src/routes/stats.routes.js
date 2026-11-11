import { Router } from 'express';
import { ROLES } from '../constants/roles.js';
import * as stats from '../controllers/stats.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';

const router = Router();

router.get('/', requireAuth, requireRole(ROLES.ADMIN), stats.overview);

export default router;
