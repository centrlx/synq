import * as productsService from '../services/products.service.js';
import { created, ok } from '../utils/response.js';

export async function list(req, res) {
  const { items, meta } = await productsService.listProducts(req.valid.query, req.user);
  return ok(res, items, { meta });
}

export async function popular(req, res) {
  return ok(res, await productsService.listPopular(req.valid.query.limit, req.user));
}

export async function view(req, res) {
  return ok(res, await productsService.registerView(req.valid.params.id));
}

export async function getById(req, res) {
  return ok(res, await productsService.getProduct(req.valid.params.id, req.user));
}

export async function create(req, res) {
  return created(res, await productsService.createProduct(req.body, req.user));
}

export async function update(req, res) {
  return ok(res, await productsService.updateProduct(req.valid.params.id, req.body, req.user));
}

export async function bulkDiscount(req, res) {
  return ok(res, await productsService.applyBulkDiscount(req.body));
}

export async function clearDiscounts(req, res) {
  return ok(res, await productsService.clearDiscounts(req.valid.query));
}

export async function remove(req, res) {
  return ok(res, await productsService.deleteProduct(req.valid.params.id));
}
