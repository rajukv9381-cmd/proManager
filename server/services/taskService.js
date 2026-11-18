import { pool } from '../database.js';
import { error, id, text } from '../utils.js';
import { isMember } from './projectService.js';

function taskFields(body) {
  const title = text(body.title, 200, 'Title');
  const description = text(body.description ?? '', 2000, 'Description', false);
  const status = body.status ?? 'todo';
  const priority = body.priority ?? 'medium';
  if (!['todo', 'in_progress', 'done'].includes(status)) throw error(400, 'Invalid status.');
  if (!['low', 'medium', 'high'].includes(priority)) throw error(400, 'Invalid priority.');
  const assignee = body.assignee_id ? id(body.assignee_id) : null;
  const due = body.due_date || null;
  if (due && (typeof due !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(due) || Number.isNaN(Date.parse(`${due}T00:00:00Z`)) || new Date(`${due}T00:00:00Z`).toISOString().slice(0, 10) !== due)) {
    throw error(400, 'Invalid due date.');
  }
  return [title, description, status, priority, assignee, due];
}

async function validateAssignee(projectId, fields) {
  if (fields[4] && !await isMember(projectId, fields[4])) throw error(400, 'Assignee must be a project member.');
}

export async function createTask(projectId, body) {
  const fields = taskFields(body);
  await validateAssignee(projectId, fields);
  const result = await pool.query('INSERT INTO tasks (title, description, status, priority, assignee_id, due_date, project_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *', [...fields, projectId]);
  return result.rows[0];
}

export async function updateTask(projectId, taskId, body) {
  const fields = taskFields(body);
  await validateAssignee(projectId, fields);
  const result = await pool.query('UPDATE tasks SET title=$1, description=$2, status=$3, priority=$4, assignee_id=$5, due_date=$6 WHERE project_id=$7 AND id=$8 RETURNING *', [...fields, projectId, id(taskId)]);
  if (!result.rowCount) throw error(404, 'Task not found.');
  return result.rows[0];
}
