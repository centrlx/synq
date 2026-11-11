import * as brandsService from '../services/brands.service.js';
import { ok } from '../utils/response.js';

export async function list(_req, res) {
  return ok(res, await brandsService.listBrands());
}
