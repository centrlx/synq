import multer from 'multer';
import { Prisma } from '@prisma/client';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

function fromPrisma(err) {
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002': {
        const target = err.meta?.target ?? err.meta?.driverAdapterError?.cause?.constraint?.fields;
        const fields = Array.isArray(target) ? target.join(', ') : target;
        return AppError.conflict(`Запись с таким значением уже существует${fields ? ` (${fields})` : ''}`, 'UNIQUE_CONSTRAINT');
      }
      case 'P2003':
        return AppError.conflict('Операция нарушает связь между записями', 'FOREIGN_KEY_CONSTRAINT');
      case 'P2025':
        return AppError.notFound('Запись не найдена');
      default:
        return null;
    }
  }
  return null;
}

function fromMulter(err) {
  if (!(err instanceof multer.MulterError)) return null;
  if (err.code === 'LIMIT_FILE_SIZE') return new AppError(413, 'FILE_TOO_LARGE', 'Файл превышает допустимый размер');
  if (err.code === 'LIMIT_UNEXPECTED_FILE') return AppError.badRequest('Файл должен передаваться в поле «file»', 'INVALID_FILE_FIELD');
  return AppError.badRequest(err.message, 'UPLOAD_ERROR');
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, _next) {
  let error = err instanceof AppError ? err : fromPrisma(err) || fromMulter(err);

  if (!error && err?.type === 'entity.parse.failed') {
    error = AppError.badRequest('Тело запроса содержит некорректный JSON', 'INVALID_JSON');
  }
  if (!error && err?.type === 'entity.too.large') {
    error = new AppError(413, 'PAYLOAD_TOO_LARGE', 'Слишком большое тело запроса');
  }

  if (!error) {
    // Непредвиденная ошибка: подробности — только в серверный лог.
    if (!env.isTest) console.error('[SYNQ] Unhandled error:', err);
    error = new AppError(500, 'INTERNAL_ERROR', 'Внутренняя ошибка сервера');
    if (!env.isProduction && err?.message) error.debug = err.message;
  }

  const body = { success: false, error: { code: error.code, message: error.message } };
  if (error.details) body.error.details = error.details;
  if (error.debug) body.error.debug = error.debug;
  res.status(error.status).json(body);
}
