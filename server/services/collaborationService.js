import { unlink } from 'node:fs/promises';
import { pool } from '../database.js';
import { error, id, text } from '../utils.js';

export async function createMessage(projectId, userId, message) {
  const body = text(message, 2000, 'Message');
  const result = await pool.query('INSERT INTO messages (project_id, user_id, body) VALUES ($1, $2, $3) RETURNING id', [projectId, userId, body]);
  return result.rows[0];
}

export async function createDocument(projectId, userId, file) {
  if (!file) throw error(400, 'Choose a file.');
  try {
    const result = await pool.query('INSERT INTO documents (project_id, user_id, original_name, stored_name, size) VALUES ($1, $2, $3, $4, $5) RETURNING id', [projectId, userId, file.originalname, file.filename, file.size]);
    return result.rows[0];
  } catch (err) {
    await unlink(file.path);
    throw err;
  }
}

export async function getDocument(projectId, documentId) {
  const result = await pool.query('SELECT original_name, stored_name FROM documents WHERE project_id = $1 AND id = $2', [projectId, id(documentId)]);
  if (!result.rowCount) throw error(404, 'Document not found.');
  return result.rows[0];
}
