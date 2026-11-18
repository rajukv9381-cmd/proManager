import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer as createHttpServer } from 'node:http';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { Server } from 'socket.io';
import { io as connectSocket } from 'socket.io-client';
import viteConfig from '../vite.config.js';

test('development proxy preserves the browser host for API and socket requests', async () => {
  process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:5432/test';
  process.env.JWT_SECRET = 'test-secret-at-least-24-characters';
  const { checkOrigin } = await import('../server/middleware.js');
  const app = express();
  app.use('/api', checkOrigin);
  app.post('/api/auth/login', (req, res) => res.json({ host: req.get('host'), origin: req.get('origin') }));
  app.use((err, req, res, next) => res.status(err.status || 500).json({ error: err.message }));

  const backend = createHttpServer(app);
  const io = new Server(backend);
  io.on('connection', socket => {
    socket.emit('headers', { host: socket.handshake.headers.host, origin: socket.handshake.headers.origin });
  });
  await new Promise(resolve => backend.listen(0, '127.0.0.1', resolve));
  const target = `http://127.0.0.1:${backend.address().port}`;
  const proxy = Object.fromEntries(Object.entries(viteConfig.server.proxy).map(([route, options]) => [
    route,
    typeof options === 'string' ? { target, changeOrigin: true } : { ...options, target }
  ]));
  const vite = await createViteServer({ configFile: false, server: { host: '127.0.0.1', port: 0, proxy }, logLevel: 'silent' });
  let socket;
  try {
    await vite.listen();
    const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
    const response = await fetch(`${origin}/api/auth/login`, { method: 'POST', headers: { Origin: origin } });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { host: new URL(origin).host, origin });

    const forbidden = await fetch(`${origin}/api/auth/login`, { method: 'POST', headers: { Origin: 'https://other.example' } });
    assert.equal(forbidden.status, 403);

    socket = connectSocket(origin, { transports: ['websocket'], extraHeaders: { Origin: origin } });
    const headers = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Socket connection timed out')), 3000);
      socket.once('headers', value => { clearTimeout(timer); resolve(value); });
      socket.once('connect_error', err => { clearTimeout(timer); reject(err); });
    });
    assert.deepEqual(headers, { host: new URL(origin).host, origin });
  } finally {
    socket?.disconnect();
    await vite.close();
    await new Promise(resolve => io.close(resolve));
  }
});
