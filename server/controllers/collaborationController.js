import path from 'node:path';
import { uploads } from '../config.js';
import * as collaborationService from '../services/collaborationService.js';
import { notifyProject } from '../socket.js';
import { wrap } from '../utils.js';

export const createMessage = wrap(async (req, res) => {
  const message = await collaborationService.createMessage(req.projectId, req.user.id, req.body.body);
  notifyProject(req.app.get('io'), req.projectId);
  res.status(201).json(message);
});

export const createDocument = wrap(async (req, res) => {
  const document = await collaborationService.createDocument(req.projectId, req.user.id, req.file);
  notifyProject(req.app.get('io'), req.projectId);
  res.status(201).json(document);
});

export const downloadDocument = wrap(async (req, res) => {
  const document = await collaborationService.getDocument(req.projectId, req.params.documentId);
  res.download(path.join(uploads, document.stored_name), document.original_name);
});
