import bcrypt from 'bcryptjs';
import { pool } from '../database.js';
import { error, text } from '../utils.js';

export async function register(body) {
  const name = text(body.name, 100, 'Name');
  const email = text(body.email, 254, 'Email').toLowerCase();
  const password = body.password;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw error(400, 'Enter a valid email address.');
  if (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password) > 72) {
    throw error(400, 'Password must be at least 8 characters and at most 72 bytes.');
  }
  const hash = await bcrypt.hash(password, 12);
  const result = await pool.query(
    'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email',
    [name, email, hash]
  );
  return result.rows[0];
}

export async function login(body) {
  const email = text(body.email, 254, 'Email').toLowerCase();
  if (typeof body.password !== 'string' || Buffer.byteLength(body.password) > 72) throw error(400, 'Invalid credentials.');
  const result = await pool.query('SELECT id, name, email, password_hash FROM users WHERE email = $1', [email]);
  const user = result.rows[0];
  if (!user || !await bcrypt.compare(body.password, user.password_hash)) throw error(401, 'Invalid email or password.');
  return { id: user.id, name: user.name, email: user.email };
}

export async function getUser(userId) {
  const result = await pool.query('SELECT id, name, email FROM users WHERE id = $1', [userId]);
  if (!result.rowCount) throw error(401, 'Please sign in.');
  return result.rows[0];
}
