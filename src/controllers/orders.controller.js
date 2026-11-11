import * as ordersService from '../services/orders.service.js';
import { created, ok } from '../utils/response.js';

export async function create(req, res) {
  return created(res, await ordersService.createOrder(req.user, req.body));
}

export async function listMine(req, res) {
  const { items, meta } = await ordersService.listMyOrders(req.user, req.valid.query);
  return ok(res, items, { meta });
}

export async function listAll(req, res) {
  const { items, meta } = await ordersService.listAllOrders(req.valid.query, req.user);
  return ok(res, items, { meta });
}

export async function getById(req, res) {
  return ok(res, await ordersService.getOrder(req.valid.params.id, req.user));
}

export async function updateStatus(req, res) {
  return ok(res, await ordersService.updateOrderStatus(req.valid.params.id, req.body.status, req.user));
}

export async function pay(req, res) {
  return ok(res, await ordersService.payOrder(req.valid.params.id, req.user, req.body));
}

export async function download(req, res) {
  return ok(res, await ordersService.getDownloadLink(req.valid.params.id, req.user));
}
