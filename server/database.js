import pg from 'pg';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { root, uploads } from './config.js';

export const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

export async function initializeDatabase() {
  await pool.query(await readFile(path.join(root, 'server', 'schema.sql'), 'utf8'));
  await mkdir(uploads, { recursive: true });
}
