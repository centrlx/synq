// Express 5 сам пробрасывает отклонённые промисы в next(),
// обёртка оставлена явной для читаемости и совместимости контроллеров.
export const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
