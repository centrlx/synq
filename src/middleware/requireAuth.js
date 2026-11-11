import { prisma } from '../config/prisma.js';
import { AppError } from '../utils/AppError.js';
import { verifyAccessToken } from '../utils/jwt.js';

const userSelect = { id: true, email: true, name: true, role: true };

function extractToken(req) {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    throw AppError.unauthorized('Заголовок Authorization должен иметь формат «Bearer <token>»', 'INVALID_TOKEN');
  }
  return token;
}

async function resolveUser(token) {
  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw AppError.unauthorized('Срок действия токена истёк, войдите снова', 'TOKEN_EXPIRED');
    }
    throw AppError.unauthorized('Недействительный токен', 'INVALID_TOKEN');
  }

  // Пользователь и роль берутся из БД, а не из токена: изменения ролей
  // и удаление аккаунта вступают в силу сразу.
  const user = await prisma.user.findUnique({ where: { id: payload.sub }, select: userSelect });
  if (!user) throw AppError.unauthorized('Пользователь токена не найден', 'INVALID_TOKEN');
  return user;
}

/** Требует действительный JWT. Кладёт пользователя в req.user. */
export async function requireAuth(req, _res, next) {
  const token = extractToken(req);
  if (!token) return next(AppError.unauthorized('Требуется авторизация: передайте JWT в заголовке Authorization'));
  req.user = await resolveUser(token);
  next();
}

/** Необязательная авторизация: гость проходит, но с токеном появляется req.user. */
export async function optionalAuth(req, _res, next) {
  const token = extractToken(req);
  req.user = token ? await resolveUser(token) : null;
  next();
}
