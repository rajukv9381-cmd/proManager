import * as taskService from '../services/taskService.js';
import { notifyProject } from '../socket.js';
import { wrap } from '../utils.js';

export const create = wrap(async (req, res) => {
  const task = await taskService.createTask(req.projectId, req.body);
  notifyProject(req.app.get('io'), req.projectId);
  res.status(201).json(task);
});

export const update = wrap(async (req, res) => {
  const task = await taskService.updateTask(req.projectId, req.params.taskId, req.body);
  notifyProject(req.app.get('io'), req.projectId);
  res.json(task);
});
