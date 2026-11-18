import 'dotenv/config';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const uploads = path.join(root, 'uploads');
export const secret = process.env.JWT_SECRET;
if (!process.env.DATABASE_URL || !secret || secret.length < 24) {
  throw new Error('DATABASE_URL and a JWT_SECRET of at least 24 characters are required.');
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/'
};
export const refreshCookieOptions = { ...cookieOptions, path: '/api/auth' };
