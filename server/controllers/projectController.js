import * as projectService from '../services/projectService.js';
import { notifyProject } from '../socket.js';
import { wrap } from '../utils.js';

export const list = wrap(async (req, res) => {
  res.json(await projectService.listProjects(req.user.id));
});

export const create = wrap(async (req, res) => {
  res.status(201).json(await projectService.createProject(req.user.id, req.body));
});

export const get = wrap(async (req, res) => {
  res.json(await projectService.getProject(req.projectId));
});

export const addMember = wrap(async (req, res) => {
  await projectService.addMember(req.projectId, req.body.email);
  notifyProject(req.app.get('io'), req.projectId);
  res.status(201).json({ success: true });
});
