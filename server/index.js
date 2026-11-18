import express from 'express';
import cookieParser from 'cookie-parser';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { root } from './config.js';
import { initializeDatabase } from './database.js';
import { checkOrigin, errorHandler } from './middleware.js';
import authRoutes from './routes/authRoutes.js';
import projectRoutes from './routes/projectRoutes.js';
import { initializeSocket } from './socket.js';

await initializeDatabase();

const app = express();
const http = createServer(app);
app.set('io', initializeSocket(http));

app.disable('x-powered-by');
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use('/api', checkOrigin);
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api', (req, res) => res.status(404).json({ error: 'Endpoint not found.' }));

if (existsSync(path.join(root, 'dist', 'index.html'))) {
  app.use(express.static(path.join(root, 'dist')));
  app.get('*', (req, res) => res.sendFile(path.join(root, 'dist', 'index.html')));
}
app.use(errorHandler);

const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || '127.0.0.1';
http.listen(port, host, () => console.log(`ProManage listening on http://${host}:${port}`));
