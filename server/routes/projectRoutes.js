import { Router } from 'express';
import * as projects from '../controllers/projectController.js';
import * as tasks from '../controllers/taskController.js';
import * as collaboration from '../controllers/collaborationController.js';
import { authenticate, requireMember, requireRole, upload } from '../middleware.js';

const router = Router();
router.use(authenticate);

router.get('/', projects.list);
router.post('/', projects.create);
router.get('/:projectId', requireMember, projects.get);
router.post('/:projectId/members', requireMember, requireRole('owner'), projects.addMember);
router.post('/:projectId/tasks', requireMember, tasks.create);
router.put('/:projectId/tasks/:taskId', requireMember, tasks.update);
router.post('/:projectId/messages', requireMember, collaboration.createMessage);
router.post('/:projectId/documents', requireMember, upload.single('file'), collaboration.createDocument);
router.get('/:projectId/documents/:documentId', requireMember, collaboration.downloadDocument);

export default router;
