import { Router } from 'express';
import * as reviews from '../controllers/reviews.controller.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { validate } from '../middleware/validate.js';
import { idParams } from '../validators/common.js';
import { reviewsQuery, updateReviewSchema } from '../validators/review.schema.js';

const router = Router();

router.get('/', validate({ query: reviewsQuery }), reviews.listAll);
router.patch('/:id', requireAuth, validate({ params: idParams, body: updateReviewSchema }), reviews.update);
router.delete('/:id', requireAuth, validate({ params: idParams }), reviews.remove);

export default router;
