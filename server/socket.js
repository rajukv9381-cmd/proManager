import { Server } from 'socket.io';
import { isMember } from './services/projectService.js';
import { isSessionActive } from './services/sessionService.js';
import { error, id, userFromToken } from './utils.js';

export function notifyProject(io, projectId) {
  io.to(`project:${projectId}`).emit('project:updated', projectId);
}

export function initializeSocket(http) {
  const io = new Server(http);
  io.use(async (socket, next) => {
    try {
      const origin = socket.handshake.headers.origin;
      if (origin && new URL(origin).host !== socket.handshake.headers.host) return next(new Error('Invalid request origin.'));
      const cookies = Object.fromEntries((socket.handshake.headers.cookie || '').split(';').map(part => {
        const i = part.indexOf('=');
        return i < 0 ? [part.trim(), ''] : [part.slice(0, i).trim(), part.slice(i + 1)];
      }));
      socket.user = userFromToken(cookies.token);
      if (!await isSessionActive(socket.user)) return next(new Error('Please sign in.'));
      next();
    } catch (err) {
      console.error('Socket authentication failed:', err);
      next(new Error('Could not authenticate live updates.'));
    }
  });
  io.on('connection', socket => {
    socket.join(`session:${socket.user.sid}`);
    const expiry = setTimeout(() => socket.disconnect(true), Math.max(0, socket.user.exp * 1000 - Date.now()));
    socket.on('disconnect', () => clearTimeout(expiry));
    socket.on('project:join', async (value, reply) => {
      try {
        const projectId = id(value);
        if (!await isSessionActive(socket.user)) throw error(401, 'Please sign in.');
        if (!await isMember(projectId, socket.user.id)) throw error(404, 'Project not found.');
        for (const room of socket.rooms) if (room.startsWith('project:')) socket.leave(room);
        await socket.join(`project:${projectId}`);
        if (typeof reply === 'function') reply({ ok: true });
      } catch (err) {
        console.error('Could not join project room:', err);
        if (typeof reply === 'function') reply({ error: err.status ? err.message : 'Could not join project updates.' });
      }
    });
  });
  return io;
}
