import { Router } from 'express';
import { ROLES } from '../constants/roles.js';
import * as uploads from '../controllers/uploads.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { requireRole } from '../middleware/requireRole.js';
import { requireFile, uploadImage, uploadProductFile } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { productIdParams, uploadTargetSchema } from '../validators/upload.schema.js';

const router = Router();

// Все операции с файлами — только для администратора.
router.use(requireAuth, requireRole(ROLES.ADMIN));

router.post('/product-image', uploadImage, requireFile, validate({ body: uploadTargetSchema }), uploads.uploadImage);
router.post('/product-file', uploadProductFile, requireFile, validate({ body: uploadTargetSchema }), uploads.uploadFile);
router.delete('/product-image/:productId', validate({ params: productIdParams }), uploads.deleteImage);
router.delete('/product-file/:productId', validate({ params: productIdParams }), uploads.deleteFile);

export default router;
