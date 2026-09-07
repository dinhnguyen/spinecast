import { Hono } from 'hono';
import type { AppEnv } from '../appEnv';
import type { ReadingSessionDto, ReadingSessionInput } from '../../shared/apiTypes';
import { ApiError } from '../errors';
import { findBook } from '../db/books';
import { findSession, insertSession, updateSessionProgress } from '../db/readingSessions';
import { markStatsDirty } from '../db/stats';
import { requireAuth } from '../middleware/requireAuth';

export const SESSION_IDLE_SECONDS = 300;

export const readingSessionRoutes = new Hono<AppEnv>();
readingSessionRoutes.use('*', requireAuth);

readingSessionRoutes.post('/:bookId/session', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new ApiError(400, 'validation', 'body must be JSON');
  }
  const b = (body ?? {}) as Partial<ReadingSessionInput>;
  if (typeof b.turns !== 'number' || !Number.isInteger(b.turns) || b.turns < 0)
    throw new ApiError(400, 'validation', 'turns must be a non-negative integer');
  if (b.sessionId !== null && typeof b.sessionId !== 'string')
    throw new ApiError(400, 'validation', 'sessionId must be a string or null');

  const bookId = c.req.param('bookId');
  const userId = c.var.user.id;
  if (!(await findBook(c.env.DB, userId, bookId))) throw new ApiError(404, 'not_found', 'book not found');

  const deviceId = c.var.device?.id ?? null;
  const now = Math.floor(Date.now() / 1000);

  // The client is never trusted to decide which session a heartbeat belongs to:
  // it can die between two turns, and the idle rule has to hold anyway.
  const existing = b.sessionId ? await findSession(c.env.DB, userId, b.sessionId) : null;
  const reusable =
    existing !== null &&
    existing.book_id === bookId &&
    existing.device_id === deviceId &&
    now - existing.ended_at <= SESSION_IDLE_SECONDS;

  if (!reusable && b.turns === 0) return c.json({ sessionId: null } satisfies ReadingSessionDto);

  if (reusable) {
    await updateSessionProgress(c.env.DB, existing.id, b.turns, now - existing.started_at, now);
    await markStatsDirty(c.env.DB, userId, bookId);
    return c.json({ sessionId: existing.id } satisfies ReadingSessionDto);
  }

  const id = crypto.randomUUID();
  // A non-null sessionId that could not be reused means the server rolled: the
  // turns the client is carrying were already written to the row it named, so
  // the new row starts empty. A null sessionId is a fresh client counting from
  // zero, and its turns belong to the row being opened.
  const rolled = Boolean(b.sessionId);
  await insertSession(c.env.DB, {
    id,
    user_id: userId,
    book_id: bookId,
    started_at: now,
    ended_at: now,
    seconds: 0,
    pages: rolled ? 0 : b.turns,
    device_id: deviceId,
  });
  await markStatsDirty(c.env.DB, userId, bookId);
  return c.json({ sessionId: id } satisfies ReadingSessionDto);
});
