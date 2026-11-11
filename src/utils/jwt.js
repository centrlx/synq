import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';

const ALGORITHM = 'HS256';
const ISSUER = 'synq-api';

export function signAccessToken(user) {
  return jwt.sign({ role: user.role }, env.JWT_SECRET, {
    subject: user.id,
    algorithm: ALGORITHM,
    expiresIn: env.JWT_EXPIRES_IN,
    issuer: ISSUER,
  });
}

export function verifyAccessToken(token) {
  // Алгоритм фиксирован, чтобы исключить подмену на "none" или RS/HS-путаницу.
  return jwt.verify(token, env.JWT_SECRET, { algorithms: [ALGORITHM], issuer: ISSUER });
}
