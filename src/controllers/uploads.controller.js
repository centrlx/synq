import * as storageService from '../services/storage.service.js';
import { created, ok } from '../utils/response.js';

export async function uploadImage(req, res) {
  return created(res, await storageService.uploadProductImage(req.valid.body.productId, req.file, req.user));
}

export async function uploadFile(req, res) {
  return created(res, await storageService.uploadProductFile(req.valid.body.productId, req.file, req.user));
}

export async function deleteImage(req, res) {
  return ok(res, await storageService.deleteProductImage(req.valid.params.productId, req.user));
}

export async function deleteFile(req, res) {
  return ok(res, await storageService.deleteProductFile(req.valid.params.productId, req.user));
}
