import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { pool } from '../database.js';
import { error, userFromToken } from '../utils.js';

const hash = token => createHash('sha256').update(token).digest('hex');
const newToken = () => randomBytes(32).toString('base64url');

export async function createSession(userId) {
  const token = newToken();
  const sessionId = randomUUID();
  await pool.query(
    `INSERT INTO auth_sessions (id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, NOW() + INTERVAL '7 days')`,
    [sessionId, userId, hash(token)]
  );
  return { sessionId, token };
}

export async function rotateSession(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) throw error(401, 'Please sign in.');
  const replacement = newToken();
  const result = await pool.query(
    `UPDATE auth_sessions SET token_hash = $1
     WHERE token_hash = $2 AND expires_at > NOW()
     RETURNING id, user_id, expires_at`,
    [hash(replacement), hash(token)]
  );
  if (!result.rowCount) throw error(401, 'Please sign in.');
  return { sessionId: result.rows[0].id, userId: result.rows[0].user_id, expiresAt: result.rows[0].expires_at, token: replacement };
}

export async function isSessionActive(user) {
  if (!user) return false;
  const result = await pool.query(
    'SELECT 1 FROM auth_sessions WHERE id = $1 AND user_id = $2 AND expires_at > NOW()',
    [user.sid, user.id]
  );
  return result.rowCount > 0;
}

export async function revokeSession(accessToken, refreshToken) {
  const user = userFromToken(accessToken, true);
  let result;
  if (user) {
    result = await pool.query('DELETE FROM auth_sessions WHERE id = $1 AND user_id = $2 RETURNING id', [user.sid, user.id]);
  } else if (typeof refreshToken === 'string' && /^[A-Za-z0-9_-]{43}$/.test(refreshToken)) {
    result = await pool.query('DELETE FROM auth_sessions WHERE token_hash = $1 RETURNING id', [hash(refreshToken)]);
  }
  return result?.rows[0]?.id;
}
