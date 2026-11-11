import * as authService from '../services/auth.service.js';
import { created, ok } from '../utils/response.js';

export async function register(req, res) {
  const result = await authService.register(req.body);
  return created(res, result);
}

export async function login(req, res) {
  const result = await authService.login(req.body);
  return ok(res, result);
}

export async function me(req, res) {
  const user = await authService.getProfile(req.user.id);
  return ok(res, user);
}
