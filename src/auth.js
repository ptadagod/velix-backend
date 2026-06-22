import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const TOKEN_TTL_DAYS = 90;

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

// We issue a JWT but also persist it in `sessions` so it can be revoked.
export function issueToken(userId) {
  const jti = crypto.randomUUID();
  const token = jwt.sign({ sub: String(userId), jti }, JWT_SECRET, {
    expiresIn: `${TOKEN_TTL_DAYS}d`,
  });
  const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 86400_000);
  return { token, expiresAt };
}

export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET); // { sub, jti, iat, exp }
  } catch {
    return null;
  }
}
