import * as categoriesService from '../services/categories.service.js';
import { created, ok } from '../utils/response.js';

export async function list(_req, res) {
  return ok(res, await categoriesService.listCategories());
}

export async function getById(req, res) {
  return ok(res, await categoriesService.getCategory(req.valid.params.id));
}

export async function products(req, res) {
  const { category, items, meta } = await categoriesService.getCategoryProducts(req.valid.params.id, req.valid.query, req.user);
  return ok(res, { category, items }, { meta });
}

export async function create(req, res) {
  return created(res, await categoriesService.createCategory(req.body));
}

export async function update(req, res) {
  return ok(res, await categoriesService.updateCategory(req.valid.params.id, req.body));
}

export async function remove(req, res) {
  return ok(res, await categoriesService.deleteCategory(req.valid.params.id));
}
