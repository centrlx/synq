/**
 * Операционная ошибка приложения с HTTP-статусом и машиночитаемым кодом.
 * Перехватывается централизованным errorHandler.
 */
export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    if (details) this.details = details;
  }

  static badRequest(message = 'Некорректный запрос', code = 'BAD_REQUEST', details) {
    return new AppError(400, code, message, details);
  }

  static unauthorized(message = 'Требуется авторизация', code = 'UNAUTHORIZED') {
    return new AppError(401, code, message);
  }

  static forbidden(message = 'Недостаточно прав', code = 'FORBIDDEN') {
    return new AppError(403, code, message);
  }

  static notFound(message = 'Ресурс не найден', code = 'NOT_FOUND') {
    return new AppError(404, code, message);
  }

  static conflict(message = 'Конфликт данных', code = 'CONFLICT') {
    return new AppError(409, code, message);
  }
}
