import bcrypt from 'bcrypt';
import { prisma } from '../config/prisma.js';
import { ROLES } from '../constants/roles.js';
import { AppError } from '../utils/AppError.js';
import { signAccessToken } from '../utils/jwt.js';
import { publicUserSelect } from './selects.js';

export const BCRYPT_ROUNDS = 12;

// Хеш-«пустышка» для выравнивания времени ответа, когда email не найден:
// так нельзя по задержке определить, зарегистрирован ли адрес.
const DUMMY_HASH = bcrypt.hashSync('synq-timing-equalizer', BCRYPT_ROUNDS);

export async function register({ email, name, password }) {
  const exists = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (exists) throw AppError.conflict('Пользователь с таким email уже зарегистрирован', 'EMAIL_TAKEN');

  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  // Роль задаётся сервером: публичная регистрация создаёт только USER.
  const user = await prisma.user.create({
    data: { email, name, passwordHash, role: ROLES.USER },
    select: publicUserSelect,
  });

  return { user, token: signAccessToken(user) };
}

export async function login({ email, password }) {
  const record = await prisma.user.findUnique({ where: { email } });
  const valid = await bcrypt.compare(password, record?.passwordHash ?? DUMMY_HASH);

  if (!record || !valid) {
    throw AppError.unauthorized('Неверный email или пароль', 'INVALID_CREDENTIALS');
  }

  const { passwordHash: _omit, ...user } = record;
  return { user, token: signAccessToken(user) };
}

export async function getProfile(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { ...publicUserSelect, _count: { select: { orders: true } } },
  });
  if (!user) throw AppError.notFound('Пользователь не найден');
  return user;
}
