import { Hono } from 'hono';
import type { AppEnv } from '../appEnv';
import type { BookmarkDto, BookmarksDto, BookmarkSyncResponse, CreateBookmarkInput } from '../../shared/apiTypes';
import { ApiError } from '../errors';
import { findBook } from '../db/books';
import { findBookmark, listBookmarks, listDirtyBookmarks, markBookmarkDeleted, upsertBookmark, type BookmarkRow } from '../db/bookmarks';
import { pullBookmarks, pushBookmarks } from '../sync/bookmarkSync';
import { BOOKMARK_SUMMARY_MAX, BOOKMARK_XPATH_MAX, bookmarkIdFor } from '../services/bookmarkId';
import { requireAuth } from '../middleware/requireAuth';

export const bookmarkRoutes = new Hono<AppEnv>();
bookmarkRoutes.use('*', requireAuth);

const toDto = (r: BookmarkRow): BookmarkDto => ({
  id: r.id,
  xpath: r.xpath,
  percentage: r.percentage,
  summary: r.summary,
  si: r.si,
  chapter: r.chapter,
  updatedAt: r.updated_at,
});

const validate = (body: unknown): CreateBookmarkInput => {
  const b = (body ?? {}) as Partial<CreateBookmarkInput>;
  if (typeof b.xpath !== 'string' || b.xpath.length < 1 || b.xpath.length > BOOKMARK_XPATH_MAX)
    throw new ApiError(400, 'validation', `xpath must be 1 to ${BOOKMARK_XPATH_MAX} characters`);
  if (typeof b.percentage !== 'number' || !Number.isFinite(b.percentage) || b.percentage < 0 || b.percentage > 1)
    throw new ApiError(400, 'validation', 'percentage must be between 0 and 1');
  if (b.summary !== undefined && (typeof b.summary !== 'string' || b.summary.length > BOOKMARK_SUMMARY_MAX))
    throw new ApiError(400, 'validation', `summary must be at most ${BOOKMARK_SUMMARY_MAX} characters`);
  if (b.si !== undefined && (typeof b.si !== 'number' || !Number.isInteger(b.si) || b.si < 0))
    throw new ApiError(400, 'validation', 'si must be a non-negative integer');
  if (b.chapter !== undefined && (typeof b.chapter !== 'string' || b.chapter.length > 64))
    throw new ApiError(400, 'validation', 'chapter must be at most 64 characters');
  return {
    xpath: b.xpath,
    percentage: b.percentage,
    ...(b.summary !== undefined ? { summary: b.summary } : {}),
    ...(b.si !== undefined ? { si: b.si } : {}),
    ...(b.chapter !== undefined ? { chapter: b.chapter } : {}),
  };
};

bookmarkRoutes.get('/:id/bookmarks', async (c) => {
  const book = await findBook(c.env.DB, c.var.user.id, c.req.param('id'));
  if (!book) throw new ApiError(404, 'not_found', 'book not found');
  const dto: BookmarksDto = { bookmarks: (await listBookmarks(c.env.DB, book.id)).map(toDto) };
  return c.json(dto);
});

bookmarkRoutes.post('/:id/bookmarks', async (c) => {
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
  const row: BookmarkRow = {
    id: await bookmarkIdFor(input.xpath),
    book_id: book.id,
    xpath: input.xpath,
    percentage: input.percentage,
    summary: input.summary ?? null,
    si: input.si ?? null,
    pc: null,
    pp: null,
    chapter: input.chapter ?? null,
    deleted: 0,
    updated_at: now,
    dirty: 1,
  };
  await upsertBookmark(c.env.DB, row);
  await pushBookmarks(c.env, c.var.user.id, book, [row]);
  const stored = await findBookmark(c.env.DB, book.id, row.id);
  return c.json(toDto(stored ?? row), 201);
});

bookmarkRoutes.delete('/:id/bookmarks/:bookmarkId', async (c) => {
  const book = await findBook(c.env.DB, c.var.user.id, c.req.param('id'));
  if (!book) throw new ApiError(404, 'not_found', 'book not found');
  const id = c.req.param('bookmarkId');
  const now = Math.floor(Date.now() / 1000);
  if (!(await markBookmarkDeleted(c.env.DB, book.id, id, now))) throw new ApiError(404, 'not_found', 'bookmark not found');
  const row = await findBookmark(c.env.DB, book.id, id);
  if (row) await pushBookmarks(c.env, c.var.user.id, book, [row]);
  return c.body(null, 204);
});

bookmarkRoutes.post('/:id/bookmarks/sync', async (c) => {
  const book = await findBook(c.env.DB, c.var.user.id, c.req.param('id'));
  if (!book) throw new ApiError(404, 'not_found', 'book not found');
  const retry = await pushBookmarks(c.env, c.var.user.id, book, await listDirtyBookmarks(c.env.DB, book.id));
  const pulled = await pullBookmarks(c.env, c.var.user.id, book);
  const dto: BookmarkSyncResponse = {
    bookmarks: (await listBookmarks(c.env.DB, book.id)).map(toDto),
    syncError: pulled.error ?? retry.error,
  };
  return c.json(dto);
});
