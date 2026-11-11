import * as reviewsService from '../services/reviews.service.js';
import { created, ok } from '../utils/response.js';

export async function listAll(req, res) {
  const { items, meta, summary } = await reviewsService.listAllReviews(req.valid.query);
  return ok(res, { items, summary }, { meta });
}

export async function listForProduct(req, res) {
  const { items, meta, summary } = await reviewsService.listProductReviews(req.valid.params.id, req.valid.query);
  return ok(res, { items, summary }, { meta });
}

export async function mine(req, res) {
  return ok(res, await reviewsService.myReviewState(req.valid.params.id, req.user));
}

export async function create(req, res) {
  return created(res, await reviewsService.createReview(req.valid.params.id, req.user, req.body));
}

export async function update(req, res) {
  return ok(res, await reviewsService.updateReview(req.valid.params.id, req.user, req.body));
}

export async function remove(req, res) {
  return ok(res, await reviewsService.deleteReview(req.valid.params.id, req.user));
}
