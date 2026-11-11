import { AppError } from '../utils/AppError.js';

/** Разрешает доступ только перечисленным ролям. Используется после requireAuth. */
export const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user) return next(AppError.unauthorized());
  if (!roles.includes(req.user.role)) {
    return next(AppError.forbidden('Недостаточно прав для выполнения операции'));
  }
  next();
};
