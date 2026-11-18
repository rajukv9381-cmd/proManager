import { pool } from '../database.js';
import { error, text } from '../utils.js';

export async function getProjectRole(projectId, userId) {
  const result = await pool.query(
    `SELECT CASE WHEN p.owner_id = pm.user_id THEN 'owner' ELSE 'member' END AS role
     FROM project_members pm JOIN projects p ON p.id = pm.project_id
     WHERE pm.project_id = $1 AND pm.user_id = $2`, [projectId, userId]
  );
  return result.rows[0]?.role || null;
}

export async function isMember(projectId, userId) {
  return Boolean(await getProjectRole(projectId, userId));
}

export async function listProjects(userId) {
  const result = await pool.query(`
    SELECT p.*, COUNT(t.id)::int AS task_count,
      COUNT(t.id) FILTER (WHERE t.status = 'done')::int AS done_count
    FROM projects p
    JOIN project_members pm ON pm.project_id = p.id AND pm.user_id = $1
    LEFT JOIN tasks t ON t.project_id = p.id
    GROUP BY p.id ORDER BY p.created_at DESC, p.id DESC`, [userId]);
  return result.rows;
}

export async function createProject(userId, body) {
  const name = text(body.name, 120, 'Project name');
  const description = text(body.description ?? '', 2000, 'Description', false);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await client.query('INSERT INTO projects (name, description, owner_id) VALUES ($1, $2, $3) RETURNING *', [name, description, userId]);
    await client.query('INSERT INTO project_members (project_id, user_id) VALUES ($1, $2)', [result.rows[0].id, userId]);
    await client.query('COMMIT');
    return result.rows[0];
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function getProject(projectId) {
  const [project, members, tasks, messages, documents] = await Promise.all([
    pool.query('SELECT * FROM projects WHERE id = $1', [projectId]),
    pool.query('SELECT u.id, u.name, u.email FROM users u JOIN project_members pm ON pm.user_id = u.id WHERE pm.project_id = $1 ORDER BY u.name', [projectId]),
    pool.query('SELECT t.*, u.name AS assignee_name FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id WHERE t.project_id = $1 ORDER BY t.created_at DESC, t.id DESC', [projectId]),
    pool.query('SELECT * FROM (SELECT m.*, u.name AS author_name FROM messages m JOIN users u ON u.id = m.user_id WHERE m.project_id = $1 ORDER BY m.id DESC LIMIT 100) recent ORDER BY id', [projectId]),
    pool.query('SELECT d.id, d.original_name, d.size, d.created_at, u.name AS author_name FROM documents d JOIN users u ON u.id = d.user_id WHERE d.project_id = $1 ORDER BY d.id DESC', [projectId])
  ]);
  return { ...project.rows[0], members: members.rows, tasks: tasks.rows, messages: messages.rows, documents: documents.rows };
}

export async function addMember(projectId, emailValue) {
  const email = text(emailValue, 254, 'Email').toLowerCase();
  const user = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (!user.rowCount) throw error(404, 'No account exists with that email.');
  const result = await pool.query('INSERT INTO project_members (project_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING user_id', [projectId, user.rows[0].id]);
  if (!result.rowCount) throw error(409, 'This user is already a member.');
}
