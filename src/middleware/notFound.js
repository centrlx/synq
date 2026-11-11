import { AppError } from '../utils/AppError.js';

export function notFound(req, _res, next) {
  next(AppError.notFound(`Маршрут ${req.method} ${req.originalUrl} не найден`, 'ROUTE_NOT_FOUND'));
}
