import { Router } from 'express';
import { ROLES } from '../constants/roles.js';
import * as users from '../controllers/users.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { validate } from '../middleware/validate.js';
import { updateMeSchema, updateRoleSchema, usersQuery } from '../validators/auth.schema.js';
import { idParams } from '../validators/common.js';

const router = Router();

router.use(requireAuth);

router.get('/', requireRole(ROLES.ADMIN), validate({ query: usersQuery }), users.list);
router.patch('/me', validate({ body: updateMeSchema }), users.updateMe);
router.get('/:id', validate({ params: idParams }), users.getById);
router.patch('/:id/role', requireRole(ROLES.ADMIN), validate({ params: idParams, body: updateRoleSchema }), users.updateRole);

export default router;
