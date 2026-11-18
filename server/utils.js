import jwt from 'jsonwebtoken';
import { secret } from './config.js';

export const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
export const error = (status, message) => Object.assign(new Error(message), { status });
export const text = (value, max, field, required = true) => {
  if (typeof value !== 'string' || (required && !value.trim()) || value.length > max) {
    throw error(400, `${field} must ${required ? 'not be empty and ' : ''}be at most ${max} characters.`);
  }
  return value.trim();
};
export const id = value => {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 2147483647) throw error(400, 'Invalid ID.');
  return parsed;
};
export const userFromToken = (token, ignoreExpiration = false) => {
  try {
    const payload = jwt.verify(token, secret, { ignoreExpiration });
    if (!Number.isSafeInteger(payload.id) || payload.id < 1 ||
        typeof payload.sid !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(payload.sid) ||
        !Number.isSafeInteger(payload.exp)) return null;
    return payload;
  } catch {
    return null;
  }
};
