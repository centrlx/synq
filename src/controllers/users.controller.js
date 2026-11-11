import * as usersService from '../services/users.service.js';
import { ok } from '../utils/response.js';

export async function list(req, res) {
  const { items, meta } = await usersService.listUsers(req.valid.query);
  return ok(res, items, { meta });
}

export async function getById(req, res) {
  const user = await usersService.getUserById(req.valid.params.id, req.user);
  return ok(res, user);
}

export async function updateMe(req, res) {
  const user = await usersService.updateMe(req.user.id, req.body);
  return ok(res, user);
}

export async function updateRole(req, res) {
  const user = await usersService.updateRole(req.valid.params.id, req.body.role, req.user);
  return ok(res, user);
}
