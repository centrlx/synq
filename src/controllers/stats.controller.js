import * as statsService from '../services/stats.service.js';
import { ok } from '../utils/response.js';

export async function overview(_req, res) {
  return ok(res, await statsService.getStats());
}
