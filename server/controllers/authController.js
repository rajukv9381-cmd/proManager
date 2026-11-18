import jwt from 'jsonwebtoken';
import { cookieOptions, refreshCookieOptions, secret } from '../config.js';
import * as authService from '../services/authService.js';
import * as sessionService from '../services/sessionService.js';
import { wrap } from '../utils.js';

function setSession(res, userId, session) {
  res.cookie('token', jwt.sign({ id: userId, sid: session.sessionId }, secret, { expiresIn: '15m' }), { ...cookieOptions, maxAge: 15 * 60000 });
  res.cookie('refreshToken', session.token, { ...refreshCookieOptions, expires: session.expiresAt || new Date(Date.now() + 7 * 86400000) });
}

export const register = wrap(async (req, res) => {
  const user = await authService.register(req.body);
  setSession(res, user.id, await sessionService.createSession(user.id));
  res.status(201).json(user);
});

export const login = wrap(async (req, res) => {
  const user = await authService.login(req.body);
  setSession(res, user.id, await sessionService.createSession(user.id));
  res.json(user);
});

export const refresh = wrap(async (req, res) => {
  const session = await sessionService.rotateSession(req.cookies.refreshToken);
  setSession(res, session.userId, session);
  res.status(204).end();
});

export const logout = wrap(async (req, res) => {
  const sessionId = await sessionService.revokeSession(req.cookies.token, req.cookies.refreshToken);
  if (sessionId) req.app.get('io').in(`session:${sessionId}`).disconnectSockets(true);
  res.clearCookie('token', cookieOptions);
  res.clearCookie('refreshToken', refreshCookieOptions);
  res.status(204).end();
});

export const me = wrap(async (req, res) => {
  res.json(await authService.getUser(req.user.id));
});
