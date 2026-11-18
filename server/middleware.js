import multer from 'multer';
import { uploads } from './config.js';
import { getProjectRole } from './services/projectService.js';
import { isSessionActive } from './services/sessionService.js';
import { error, id, userFromToken, wrap } from './utils.js';

export const upload = multer({ dest: uploads, limits: { fileSize: 10 * 1024 * 1024 } });

export function checkOrigin(req, res, next) {
  const origin = req.get('origin');
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && origin) {
    try {
      if (new URL(origin).host !== req.get('host')) return next(error(403, 'Invalid request origin.'));
    } catch {
      return next(error(403, 'Invalid request origin.'));
    }
  }
  next();
}

export const authenticate = wrap(async (req, res, next) => {
  req.user = userFromToken(req.cookies.token);
  if (!await isSessionActive(req.user)) throw error(401, 'Please sign in.');
  next();
});

export const requireMember = wrap(async (req, res, next) => {
  req.projectId = id(req.params.projectId);
  req.projectRole = await getProjectRole(req.projectId, req.user.id);
  if (!req.projectRole) throw error(404, 'Project not found.');
  next();
});

export const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.projectRole)) return next(error(403, 'Only the project owner can add members.'));
  next();
};

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);
  if (!err.status && err.code !== '23505' && !(err instanceof multer.MulterError)) console.error(err);
  if (err.code === '23505') return res.status(409).json({ error: 'That email is already registered.' });
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'File must be 10 MB or smaller.' : err.message });
  res.status(err.status || 500).json({ error: err.status ? err.message : 'Something went wrong on the server.' });
}
