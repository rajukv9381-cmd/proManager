import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import pg from 'pg';
import jwt from 'jsonwebtoken';
import { io } from 'socket.io-client';

const databaseUrl = process.env.PROMANAGE_TEST_DATABASE_URL;
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test('project collaboration, authorization, live updates and documents', { skip: !databaseUrl, timeout: 30000 }, async () => {
  const listener = createServer();
  await new Promise((resolve, reject) => listener.once('error', reject).listen(0, '127.0.0.1', resolve));
  const port = listener.address().port;
  await new Promise(resolve => listener.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  const db = new pg.Pool({ connectionString: databaseUrl });
  const child = spawn(process.execPath, ['server/index.js'], {
    cwd: root,
    env: { ...process.env, NODE_ENV: 'test', DATABASE_URL: databaseUrl, JWT_SECRET: 'integration-test-secret-not-for-production', PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let output = '';
  child.stdout.on('data', data => { output += data; });
  child.stderr.on('data', data => { output += data; });
  const unique = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const emails = [`owner-${unique}@example.test`, `member-${unique}@example.test`, `outsider-${unique}@example.test`];
  let projectId;
  let storedName;
  let socket;
  async function request(url, { cookie, body, headers = {}, ...options } = {}) {
    const response = await fetch(`${base}${url}`, {
      ...options,
      headers: { ...headers, ...(cookie ? { Cookie: cookie } : {}), ...(body && !(body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}) },
      body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined
    });
    const payload = response.headers.get('content-type')?.includes('application/json') ? await response.json() : await response.text();
    const responseCookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    return { response, payload, cookie: responseCookie };
  }
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (child.exitCode !== null) throw new Error(`Server exited: ${output}`);
      try {
        await fetch(`${base}/api/auth/me`);
        ready = true;
        break;
      } catch {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    assert.ok(ready, `Server did not start: ${output}`);
    const register = email => request('/api/auth/register', { method: 'POST', body: { name: email.split('@')[0], email, password: 'testing-password' } });
    const [owner, member, outsider] = await Promise.all(emails.map(register));
    assert.equal(owner.response.status, 201);
    assert.equal(member.response.status, 201);
    assert.equal(outsider.response.status, 201);
    assert.equal((await register(emails[0])).response.status, 409);
    assert.equal((await request('/api/projects')).response.status, 401);
    assert.equal((await request('/api/auth/refresh', { method: 'POST' })).response.status, 401);
    assert.equal((await request('/api/auth/logout', { method: 'POST', headers: { Origin: 'https://other.example' } })).response.status, 403);
    assert.equal((await request('/api/auth/login', { method: 'POST', body: { email: emails[0], password: 'wrong-password' } })).response.status, 401);
    const login = await request('/api/auth/login', { method: 'POST', body: { email: emails[0], password: 'testing-password' } });
    assert.equal(login.response.status, 200);
    assert.equal(login.payload.id, owner.payload.id);
    const cookies = login.response.headers.getSetCookie();
    assert.ok(cookies.some(value => value.startsWith('token=') && value.includes('HttpOnly') && value.includes('Max-Age=900')));
    assert.ok(cookies.some(value => value.startsWith('refreshToken=') && value.includes('HttpOnly') && value.includes('Path=/api/auth')));
    assert.equal((await request('/api/auth/me', { cookie: login.cookie })).payload.id, owner.payload.id);
    const access = login.cookie.split('; ').find(part => part.startsWith('token=')).slice(6);
    const payload = jwt.decode(access);
    assert.ok(payload.exp - payload.iat <= 15 * 60);
    const expired = jwt.sign({ id: payload.id, sid: payload.sid }, 'integration-test-secret-not-for-production', { expiresIn: -1 });
    const refreshCookie = login.cookie.split('; ').find(part => part.startsWith('refreshToken='));
    assert.equal((await request('/api/auth/me', { cookie: `token=${expired}; ${refreshCookie}` })).response.status, 401);
    const refreshed = await request('/api/auth/refresh', { method: 'POST', cookie: `token=${expired}; ${refreshCookie}` });
    assert.equal(refreshed.response.status, 204);
    assert.notEqual(refreshed.cookie, login.cookie);
    assert.equal((await request('/api/auth/refresh', { method: 'POST', cookie: login.cookie })).response.status, 401);
    assert.equal((await request('/api/auth/me', { cookie: refreshed.cookie })).payload.id, owner.payload.id);
    const raceLogin = await request('/api/auth/login', { method: 'POST', body: { email: emails[2], password: 'testing-password' } });
    const rotations = await Promise.all([
      request('/api/auth/refresh', { method: 'POST', cookie: raceLogin.cookie }),
      request('/api/auth/refresh', { method: 'POST', cookie: raceLogin.cookie })
    ]);
    assert.deepEqual(rotations.map(result => result.response.status).sort(), [204, 401]);

    const created = await request('/api/projects', { method: 'POST', cookie: owner.cookie, body: { name: 'Test project', description: 'Integration test' } });
    assert.equal(created.response.status, 201);
    projectId = created.payload.id;
    const projectUrl = `/api/projects/${projectId}`;
    assert.equal((await request(projectUrl, { cookie: outsider.cookie })).response.status, 404);
    assert.equal((await request(`${projectUrl}/members`, { method: 'POST', cookie: owner.cookie, body: { email: emails[1] } })).response.status, 201);
    assert.equal((await request(`${projectUrl}/members`, { method: 'POST', cookie: owner.cookie, body: { email: emails[1] } })).response.status, 409);
    assert.equal((await request(`${projectUrl}/members`, { method: 'POST', cookie: member.cookie, body: { email: emails[2] } })).response.status, 403);
    assert.equal((await request(`${projectUrl}/tasks`, { method: 'POST', cookie: member.cookie, body: { title: 'Bad assignment', assignee_id: outsider.payload.id } })).response.status, 400);
    assert.equal((await request(`${projectUrl}/tasks`, { method: 'POST', cookie: member.cookie, body: { title: 'Bad date', due_date: '2026-02-30' } })).response.status, 400);

    socket = io(base, { extraHeaders: { Cookie: member.cookie }, transports: ['websocket'] });
    await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); });
    const join = await socket.timeout(3000).emitWithAck('project:join', projectId);
    assert.equal(join.ok, true);
    const update = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Live update not received')), 3000);
      socket.once('project:updated', value => { clearTimeout(timer); resolve(value); });
    });
    const task = await request(`${projectUrl}/tasks`, { method: 'POST', cookie: owner.cookie, body: { title: 'Build feature', assignee_id: member.payload.id, priority: 'high' } });
    assert.equal(task.response.status, 201);
    assert.equal(await update, projectId);
    const edited = await request(`${projectUrl}/tasks/${task.payload.id}`, { method: 'PUT', cookie: member.cookie, body: { ...task.payload, status: 'done' } });
    assert.equal(edited.response.status, 200);
    assert.equal((await request(`${projectUrl}/messages`, { method: 'POST', cookie: member.cookie, body: { body: 'Hello team' } })).response.status, 201);

    const form = new FormData();
    form.append('file', new Blob(['project document']), 'notes.txt');
    const document = await request(`${projectUrl}/documents`, { method: 'POST', cookie: owner.cookie, body: form });
    assert.equal(document.response.status, 201);
    const row = await db.query('SELECT stored_name FROM documents WHERE id = $1 AND project_id = $2', [document.payload.id, projectId]);
    storedName = row.rows[0].stored_name;
    assert.equal((await request(`${projectUrl}/documents/${document.payload.id}`, { cookie: outsider.cookie })).response.status, 404);
    const download = await request(`${projectUrl}/documents/${document.payload.id}`, { cookie: member.cookie });
    assert.equal(download.payload, 'project document');
    const detail = await request(projectUrl, { cookie: member.cookie });
    assert.equal(detail.payload.tasks[0].status, 'done');
    assert.equal(detail.payload.messages[0].body, 'Hello team');
    assert.equal(detail.payload.documents[0].original_name, 'notes.txt');
    const logout = await request('/api/auth/logout', { method: 'POST', cookie: refreshed.cookie });
    assert.equal(logout.response.status, 204);
    assert.match(logout.response.headers.get('set-cookie'), /token=;/);
    assert.equal((await request('/api/auth/me', { cookie: refreshed.cookie })).response.status, 401);
    assert.equal((await request('/api/auth/refresh', { method: 'POST', cookie: refreshed.cookie })).response.status, 401);
    const disconnected = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Socket was not disconnected at logout')), 3000);
      socket.once('disconnect', reason => { clearTimeout(timer); resolve(reason); });
    });
    assert.equal((await request('/api/auth/logout', { method: 'POST', cookie: member.cookie })).response.status, 204);
    assert.equal(await disconnected, 'io server disconnect');
    assert.equal((await request(projectUrl, { cookie: member.cookie })).response.status, 401);
  } finally {
    socket?.disconnect();
    child.kill();
    if (projectId) await db.query('DELETE FROM projects WHERE id = $1', [projectId]);
    await db.query('DELETE FROM users WHERE email = ANY($1::text[])', [emails]);
    if (storedName) await unlink(path.join(root, 'uploads', storedName));
    await db.end();
  }
});
