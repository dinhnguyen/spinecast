import { Hono } from 'hono';
import type { AppEnv } from '../appEnv';
import { ApiError } from '../errors';
import { findBook, touchBookOpened } from '../db/books';
import { getProgress, upsertProgress } from '../db/progress';
import { touchDevice } from '../db/devices';
import { requireAuth } from '../middleware/requireAuth';
import { validatePosition } from '../../shared/position';
import type { ProgressResponse, PutProgressResponse } from '../../shared/apiTypes';
import { fetchRemoteProgress, pushProgress } from '../sync/syncService';

export const progressRoutes = new Hono<AppEnv>();
progressRoutes.use('*', requireAuth);

progressRoutes.on(['PUT', 'POST'], '/:id/progress', async (c) => {
  const book = await findBook(c.env.DB, c.var.user.id, c.req.param('id'));
  if (!book) throw new ApiError(404, 'not_found', 'book not found');
  let pos;
  try {
    pos = validatePosition(await c.req.json());
  } catch (e) {
    throw new ApiError(400, 'validation', e instanceof Error ? e.message : 'invalid position');
  }
  const now = Math.floor(Date.now() / 1000);
  // A browser whose clock runs fast would otherwise pin the row forever.
  if (pos.observedAt !== undefined && pos.observedAt > now) pos.observedAt = now;
  const device = c.var.device;
  const applied = await upsertProgress(c.env.DB, book.id, pos, now, device?.id ?? null);
  await touchBookOpened(c.env.DB, book.id, now);
  if (device) await touchDevice(c.env.DB, c.var.user.id, device.id, now);
  const local = await getProgress(c.env.DB, book.id);
  if (!local) throw new ApiError(500, 'internal', 'failed to reload progress');
  const result = applied
    ? await pushProgress(c.env, c.var.user.id, book, pos, device)
    : { pushed: false, error: null };
  const refreshed = result.pushed ? await getProgress(c.env.DB, book.id) : local;
  const body: PutProgressResponse = { local: refreshed ?? local, pushed: result.pushed, syncError: result.error };
  return c.json(body);
});

progressRoutes.get('/:id/progress', async (c) => {
  const book = await findBook(c.env.DB, c.var.user.id, c.req.param('id'));
  if (!book) throw new ApiError(404, 'not_found', 'book not found');
  const [local, remoteResult] = await Promise.all([getProgress(c.env.DB, book.id), fetchRemoteProgress(c.env, c.var.user.id, book)]);
  const body: ProgressResponse = { local, remote: remoteResult.remote, syncError: remoteResult.error };
  return c.json(body);
});
