import { Hono } from 'hono';
import type { AppEnv } from '../appEnv';
import type { ClippingDto, ClippingsDto, ClippingSyncResponse, CreateClippingInput, UpdateClippingInput } from '../../shared/apiTypes';
import { ApiError } from '../errors';
import { findBook } from '../db/books';
import {
  findClipping,
  listClippings,
  listDirtyClippings,
  markClippingDeleted,
  setClippingCfi,
  upsertClipping,
  type ClippingRow,
} from '../db/clippings';
import { pullClippings, pushClippings } from '../sync/clippingSync';
import { CLIPPING_CFI_MAX, CLIPPING_CHAPTER_MAX, CLIPPING_NOTE_MAX, CLIPPING_TEXT_MAX, clippingIdFor, isHighlightColor } from '../services/clippingId';
import { requireAuth } from '../middleware/requireAuth';

export const clippingRoutes = new Hono<AppEnv>();
clippingRoutes.use('*', requireAuth);

const byteLength = (v: string): number => new TextEncoder().encode(v).length;

const toDto = (r: ClippingRow): ClippingDto => ({
  id: r.id,
  spine: r.spine,
  para: r.para,
  chapter: r.chapter,
  text: r.text,
  note: r.note,
  color: r.color,
  cfi: r.cfi,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const validate = (body: unknown): CreateClippingInput => {
  const b = (body ?? {}) as Partial<CreateClippingInput>;
  if (typeof b.text !== 'string' || byteLength(b.text) < 1 || byteLength(b.text) > CLIPPING_TEXT_MAX)
    throw new ApiError(400, 'validation', `text must be 1 to ${CLIPPING_TEXT_MAX} bytes`);
  if (b.spine !== undefined && (typeof b.spine !== 'number' || !Number.isInteger(b.spine) || b.spine < 0))
    throw new ApiError(400, 'validation', 'spine must be a non-negative integer');
  if (b.para !== undefined && (typeof b.para !== 'number' || !Number.isInteger(b.para) || b.para < 0))
    throw new ApiError(400, 'validation', 'para must be a non-negative integer');
  if (b.chapter !== undefined && (typeof b.chapter !== 'string' || b.chapter.length > CLIPPING_CHAPTER_MAX))
    throw new ApiError(400, 'validation', `chapter must be at most ${CLIPPING_CHAPTER_MAX} characters`);
  if (b.color !== undefined && !isHighlightColor(b.color))
    throw new ApiError(400, 'validation', 'color must be one of the highlight colors');
  if (b.note !== undefined && (typeof b.note !== 'string' || byteLength(b.note) > CLIPPING_NOTE_MAX))
    throw new ApiError(400, 'validation', `note must be at most ${CLIPPING_NOTE_MAX} bytes`);
  if (b.cfi !== undefined && (typeof b.cfi !== 'string' || b.cfi.length > CLIPPING_CFI_MAX))
    throw new ApiError(400, 'validation', `cfi must be at most ${CLIPPING_CFI_MAX} characters`);
  return {
    text: b.text,
    ...(b.spine !== undefined ? { spine: b.spine } : {}),
    ...(b.para !== undefined ? { para: b.para } : {}),
    ...(b.chapter !== undefined ? { chapter: b.chapter } : {}),
    ...(b.color !== undefined ? { color: b.color } : {}),
    ...(b.note !== undefined ? { note: b.note } : {}),
    ...(b.cfi !== undefined ? { cfi: b.cfi } : {}),
  };
};

const validateUpdate = (body: unknown): UpdateClippingInput => {
  const b = (body ?? {}) as Partial<UpdateClippingInput>;
  if (b.note !== undefined && b.note !== null && (typeof b.note !== 'string' || byteLength(b.note) > CLIPPING_NOTE_MAX))
    throw new ApiError(400, 'validation', `note must be at most ${CLIPPING_NOTE_MAX} bytes`);
  if (b.color !== undefined && !isHighlightColor(b.color))
    throw new ApiError(400, 'validation', 'color must be one of the highlight colors');
  if (b.cfi !== undefined && (typeof b.cfi !== 'string' || b.cfi.length > CLIPPING_CFI_MAX))
    throw new ApiError(400, 'validation', `cfi must be at most ${CLIPPING_CFI_MAX} characters`);
  return {
    ...(b.note !== undefined ? { note: b.note } : {}),
    ...(b.color !== undefined ? { color: b.color } : {}),
    ...(b.cfi !== undefined ? { cfi: b.cfi } : {}),
  };
};

clippingRoutes.get('/:id/clippings', async (c) => {
  const book = await findBook(c.env.DB, c.var.user.id, c.req.param('id'));
  if (!book) throw new ApiError(404, 'not_found', 'book not found');
  const dto: ClippingsDto = { clippings: (await listClippings(c.env.DB, book.id)).map(toDto) };
  return c.json(dto);
});

clippingRoutes.post('/:id/clippings', async (c) => {
  const book = await findBook(c.env.DB, c.var.user.id, c.req.param('id'));
  if (!book) throw new ApiError(404, 'not_found', 'book not found');
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new ApiError(400, 'validation', 'body must be JSON');
  }
  const input = validate(body);
  const now = Math.floor(Date.now() / 1000);
  const row: ClippingRow = {
    id: await clippingIdFor(now, input.text),
    book_id: book.id,
    spine: input.spine ?? null,
    start_page: null,
    end_page: null,
    pages: null,
    start_word: null,
    end_word: null,
    words: null,
    para: input.para ?? null,
    chapter: input.chapter ?? null,
    text: input.text,
    note: input.note ?? null,
    color: input.color ?? null,
    cfi: input.cfi ?? null,
    created_at: now,
    deleted: 0,
    updated_at: now,
    dirty: 1,
  };
  await upsertClipping(c.env.DB, row);
  await pushClippings(c.env, c.var.user.id, book, [row]);
  const stored = await findClipping(c.env.DB, book.id, row.id);
  return c.json(toDto(stored ?? row), 201);
});

clippingRoutes.patch('/:id/clippings/:clippingId', async (c) => {
  const book = await findBook(c.env.DB, c.var.user.id, c.req.param('id'));
  if (!book) throw new ApiError(404, 'not_found', 'book not found');
  const id = c.req.param('clippingId');
  const existing = await findClipping(c.env.DB, book.id, id);
  if (!existing) throw new ApiError(404, 'not_found', 'clipping not found');
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new ApiError(400, 'validation', 'body must be JSON');
  }
  const input = validateUpdate(body);

  // No fields supplied: a full-row push here would re-assert stale local content
  // as newer than anything on the server, silently losing a concurrent remote
  // edit on the next pull. An empty patch expresses no intent, so it is a no-op.
  if (Object.keys(input).length === 0) return c.json(toDto(existing));

  // A cfi-only patch is local bookkeeping, not an edit: it must not bump dirty
  // or updated_at, so it skips the push path entirely.
  if (input.cfi !== undefined && input.note === undefined && input.color === undefined) {
    await setClippingCfi(c.env.DB, book.id, id, input.cfi);
  } else {
    const now = Math.floor(Date.now() / 1000);
    const row: ClippingRow = {
      ...existing,
      note: input.note !== undefined ? input.note : existing.note,
      color: input.color !== undefined ? input.color : existing.color,
      cfi: input.cfi !== undefined ? input.cfi : existing.cfi,
      updated_at: now,
      dirty: 1,
    };
    await upsertClipping(c.env.DB, row);
    await pushClippings(c.env, c.var.user.id, book, [row]);
  }
  const stored = await findClipping(c.env.DB, book.id, id);
  return c.json(toDto(stored!));
});

clippingRoutes.delete('/:id/clippings/:clippingId', async (c) => {
  const book = await findBook(c.env.DB, c.var.user.id, c.req.param('id'));
  if (!book) throw new ApiError(404, 'not_found', 'book not found');
  const id = c.req.param('clippingId');
  const now = Math.floor(Date.now() / 1000);
  if (!(await markClippingDeleted(c.env.DB, book.id, id, now))) throw new ApiError(404, 'not_found', 'clipping not found');
  const row = await findClipping(c.env.DB, book.id, id);
  if (row) await pushClippings(c.env, c.var.user.id, book, [row]);
  return c.body(null, 204);
});

clippingRoutes.post('/:id/clippings/sync', async (c) => {
  const book = await findBook(c.env.DB, c.var.user.id, c.req.param('id'));
  if (!book) throw new ApiError(404, 'not_found', 'book not found');
  const retry = await pushClippings(c.env, c.var.user.id, book, await listDirtyClippings(c.env.DB, book.id));
  const pulled = await pullClippings(c.env, c.var.user.id, book);
  const dto: ClippingSyncResponse = {
    clippings: (await listClippings(c.env.DB, book.id)).map(toDto),
    syncError: pulled.error ?? retry.error,
  };
  return c.json(dto);
});
