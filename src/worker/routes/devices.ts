import { Hono } from 'hono';
import type { AppEnv } from '../appEnv';
import type { DeviceDto, DevicesDto } from '../../shared/apiTypes';
import { ApiError } from '../errors';
import { deleteDevice, findDevice, listDevices, renameDevice, type DeviceRow } from '../db/devices';
import { DEVICE_NAME_MAX } from '../services/deviceName';
import { requireAuth } from '../middleware/requireAuth';

export const deviceRoutes = new Hono<AppEnv>();
deviceRoutes.use('*', requireAuth);

const toDto = (row: DeviceRow, currentId: string | null): DeviceDto => ({
  id: row.id,
  name: row.name,
  createdAt: row.created_at,
  lastSeenAt: row.last_seen_at,
  current: row.id === currentId,
});

deviceRoutes.get('/', async (c) => {
  const rows = await listDevices(c.env.DB, c.var.user.id);
  const dto: DevicesDto = { devices: rows.map((r) => toDto(r, c.var.device?.id ?? null)) };
  return c.json(dto);
});

deviceRoutes.patch('/:id', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new ApiError(400, 'validation', 'body must be JSON');
  }
  const name = (body as { name?: unknown } | null)?.name;
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (typeof name !== 'string' || trimmed.length < 1 || trimmed.length > DEVICE_NAME_MAX)
    throw new ApiError(400, 'validation', `device name must be 1 to ${DEVICE_NAME_MAX} characters`);
  if (!(await renameDevice(c.env.DB, c.var.user.id, c.req.param('id'), trimmed)))
    throw new ApiError(404, 'not_found', 'device not found');
  const row = await findDevice(c.env.DB, c.var.user.id, c.req.param('id'));
  return c.json(toDto(row!, c.var.device?.id ?? null));
});

deviceRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  // Deleting the device you are using would leave this session unattributed
  // until the next login, with no way to get it back.
  if (id === c.var.device?.id) throw new ApiError(400, 'validation', 'cannot remove the device you are using');
  if (!(await deleteDevice(c.env.DB, c.var.user.id, id))) throw new ApiError(404, 'not_found', 'device not found');
  return c.body(null, 204);
});
