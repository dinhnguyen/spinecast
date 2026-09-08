import { createMiddleware } from 'hono/factory';
import { getCookie } from 'hono/cookie';
import type { AppEnv } from '../appEnv';
import { ApiError } from '../errors';
import { findUserById } from '../db/users';
import { findDevice } from '../db/devices';
import { getSession } from '../services/session';

export const SESSION_COOKIE = 'session';

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) throw new ApiError(401, 'unauthorized', 'login required');
  const session = await getSession(c.env, token);
  if (!session) throw new ApiError(401, 'unauthorized', 'session expired');
  const user = await findUserById(c.env.DB, session.userId);
  if (!user) throw new ApiError(401, 'unauthorized', 'user not found');
  if (user.disabled_at !== null) throw new ApiError(401, 'account_disabled', 'account disabled');
  if (session.epoch < user.session_epoch) throw new ApiError(401, 'unauthorized', 'session expired');
  // A session names the device row it was minted for. If that row is gone -
  // removed by the user in Settings or revoked by an admin - the session goes
  // with it. Sessions minted before device identity carry no device id and
  // are left alone.
  const device = session.deviceId ? await findDevice(c.env.DB, user.id, session.deviceId) : null;
  if (session.deviceId && !device) throw new ApiError(401, 'unauthorized', 'device revoked');
  c.set('device', device);
  c.set('user', { id: user.id, email: user.email, role: user.role, locale: user.locale, deviceId: device?.id ?? null });
  await next();
});

export const requireAdmin = createMiddleware<AppEnv>(async (c, next) => {
  if (c.var.user.role !== 'admin') throw new ApiError(403, 'forbidden', 'admin only');
  await next();
});
