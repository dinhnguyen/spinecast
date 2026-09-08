import { Hono } from 'hono';
import type { AdminUserDetailDto, AdminUserPatch, DeviceDto } from '../../shared/apiTypes';
import type { AppEnv } from '../appEnv';
import { getAdminUser, listAdminUsers, patchAdminUser } from '../db/adminUsers';
import { deleteDevice, listDevices, type DeviceRow } from '../db/devices';
import { deletePasskey, listPasskeys, toPasskeyDto } from '../db/passkeys';
import { issuePasswordReset } from '../db/passwordResets';
import { findUserById } from '../db/users';
import { ApiError } from '../errors';
import { deleteUser } from '../services/deleteUser';

export const parseAdminUserPatch = (body: unknown): AdminUserPatch => {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 1)
    throw new ApiError(400, 'validation', 'exactly one change required');
  if ('role' in body && (body.role === 'admin' || body.role === 'user')) return { role: body.role };
  if ('disabled' in body && typeof body.disabled === 'boolean') return { disabled: body.disabled };
  throw new ApiError(400, 'validation', 'invalid user change');
};

export const adminUserRoutes = new Hono<AppEnv>();

const deviceDto = (row: DeviceRow): DeviceDto => ({
  id: row.id,
  name: row.name,
  createdAt: row.created_at,
  lastSeenAt: row.last_seen_at,
  current: false,
});

adminUserRoutes.get('/', async (c) => c.json({ items: await listAdminUsers(c.env.DB) }));

adminUserRoutes.patch('/:id', async (c) => {
  const id = c.req.param('id');
  if (id === c.var.user.id) throw new ApiError(409, 'self_action', 'cannot change your own admin account');
  if (!(await getAdminUser(c.env.DB, id))) throw new ApiError(404, 'not_found', 'user not found');
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new ApiError(400, 'validation', 'body must be JSON');
  }
  const patch = parseAdminUserPatch(body);
  await patchAdminUser(c.env.DB, id, patch, Math.floor(Date.now() / 1000));
  return c.json((await getAdminUser(c.env.DB, id))!);
});

adminUserRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  if (id === c.var.user.id) throw new ApiError(409, 'self_action', 'cannot delete your own admin account');
  if (!(await findUserById(c.env.DB, id))) throw new ApiError(404, 'not_found', 'user not found');
  await deleteUser(c.env.DB, c.env.BOOKS, id);
  return c.body(null, 204);
});

adminUserRoutes.post('/:id/reset-code', async (c) => {
  const id = c.req.param('id');
  if (!(await getAdminUser(c.env.DB, id))) throw new ApiError(404, 'not_found', 'user not found');
  const dto = await issuePasswordReset(c.env.DB, id, c.var.user.id, Math.floor(Date.now() / 1000));
  c.header('Cache-Control', 'no-store');
  return c.json(dto, 201);
});

adminUserRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  const user = await getAdminUser(c.env.DB, id);
  if (!user) throw new ApiError(404, 'not_found', 'user not found');
  const [devices, passkeys] = await Promise.all([listDevices(c.env.DB, id), listPasskeys(c.env.DB, id)]);
  const dto: AdminUserDetailDto = {
    ...user,
    devices: devices.map(deviceDto),
    passkeys: passkeys.map(toPasskeyDto),
  };
  return c.json(dto);
});

adminUserRoutes.delete('/:id/devices/:deviceId', async (c) => {
  if (!(await deleteDevice(c.env.DB, c.req.param('id'), c.req.param('deviceId'))))
    throw new ApiError(404, 'not_found', 'device not found');
  return c.body(null, 204);
});

adminUserRoutes.delete('/:id/passkeys/:passkeyId', async (c) => {
  if (!(await deletePasskey(c.env.DB, c.req.param('id'), c.req.param('passkeyId'))))
    throw new ApiError(404, 'not_found', 'passkey not found');
  return c.body(null, 204);
});
