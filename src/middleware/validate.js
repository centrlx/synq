import { AppError } from '../utils/AppError.js';

function formatIssues(error) {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || '(root)',
    message: issue.message,
  }));
}

/**
 * Валидация body / query / params через Zod.
 * В Express 5 req.query доступен только для чтения, поэтому разобранные
 * значения кладутся в req.valid.{body,query,params}; req.body заменяется
 * очищенной версией (лишние поля отбрасываются — защита от mass assignment).
 */
export const validate = (schemas) => (req, _res, next) => {
  req.valid = req.valid || {};
  for (const part of ['params', 'query', 'body']) {
    if (!schemas[part]) continue;
    const input = part === 'body' ? (req.body ?? {}) : req[part];
    const result = schemas[part].safeParse(input);
    if (!result.success) {
      return next(AppError.badRequest('Ошибка валидации входных данных', 'VALIDATION_ERROR', formatIssues(result.error)));
    }
    req.valid[part] = result.data;
    if (part === 'body') req.body = result.data;
  }
  next();
};
