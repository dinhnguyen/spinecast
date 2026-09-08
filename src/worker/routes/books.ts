import { Hono } from 'hono';
import type { AppEnv } from '../appEnv';
import { ApiError } from '../errors';
import { findBook, findBookWithProgress, listBooksWithProgress, setBookShared } from '../db/books';
import { requireAuth } from '../middleware/requireAuth';
import { deleteBookAndBlob } from '../services/deleteBook';
import { EpubParseError } from '../services/epub';
import { ingestBook } from '../services/ingestBook';

export const bookRoutes = new Hono<AppEnv>();
bookRoutes.use('*', requireAuth);

bookRoutes.post('/upload', async (c) => {
  const max = Number(c.env.MAX_UPLOAD_BYTES);
  const declared = Number(c.req.header('content-length') ?? '0');
  if (declared > max) throw new ApiError(413, 'too_large', 'file exceeds 100 MB');
  const form = await c.req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) throw new ApiError(400, 'validation', 'file required');
  if (!file.name.toLowerCase().endsWith('.epub')) throw new ApiError(400, 'not_epub', 'only .epub files accepted');
  if (file.size > max) throw new ApiError(413, 'too_large', 'file exceeds 100 MB');
  const bytes = new Uint8Array(await file.arrayBuffer());

  let res;
  try {
    res = await ingestBook(c.env.DB, c.env.BOOKS, { userId: c.var.user.id, filename: file.name, bytes, source: null });
  } catch (e) {
    if (e instanceof EpubParseError) throw new ApiError(400, 'not_epub', e.message);
    throw e;
  }
  if (!res.ok) return c.json({ error: { code: 'duplicate', message: 'already in library', bookId: res.bookId } }, 409);
  return c.json(await findBookWithProgress(c.env.DB, c.var.user.id, res.bookId), 201);
});

bookRoutes.get('/', async (c) => c.json({ items: await listBooksWithProgress(c.env.DB, c.var.user.id) }));

const parseIds = (body: unknown): string[] => {
  const ids = (body as { ids?: unknown } | null)?.ids;
  if (!Array.isArray(ids) || ids.length === 0 || !ids.every((i) => typeof i === 'string')) {
    throw new ApiError(400, 'validation', 'ids must be a non-empty array of strings');
  }
  return ids;
};

bookRoutes.post('/bulk-delete', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new ApiError(400, 'validation', 'body must be JSON');
  }
  const ids = parseIds(body);
  const deleted: string[] = [];
  for (const id of ids) {
    const book = await findBook(c.env.DB, c.var.user.id, id);
    if (!book) continue;
    await deleteBookAndBlob(c.env.DB, c.env.BOOKS, book);
    deleted.push(id);
  }
  return c.json({ deleted });
});

bookRoutes.patch('/bulk-share', async (c) => {
  let body: { ids?: unknown; shared?: unknown };
  try {
    body = (await c.req.json()) as { ids?: unknown; shared?: unknown };
  } catch {
    throw new ApiError(400, 'validation', 'body must be JSON');
  }
  const ids = parseIds(body);
  if (typeof body.shared !== 'boolean') throw new ApiError(400, 'validation', 'shared must be true or false');
  const items = [];
  for (const id of ids) {
    const ok = await setBookShared(c.env.DB, c.var.user.id, id, body.shared);
    if (ok) items.push(await findBookWithProgress(c.env.DB, c.var.user.id, id));
  }
  return c.json({ items });
});

bookRoutes.get('/:id', async (c) => {
  const dto = await findBookWithProgress(c.env.DB, c.var.user.id, c.req.param('id'));
  if (!dto) throw new ApiError(404, 'not_found', 'book not found');
  return c.json(dto);
});

const streamObject = async (c: { env: { BOOKS: R2Bucket } }, key: string, fallbackType: string): Promise<Response> => {
  const obj = await c.env.BOOKS.get(key);
  if (!obj) throw new ApiError(404, 'not_found', 'file not found');
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  if (!headers.get('content-type')) headers.set('content-type', fallbackType);
  headers.set('cache-control', 'private, max-age=3600');
  headers.set('etag', obj.httpEtag);
  return new Response(obj.body, { headers });
};

bookRoutes.get('/:id/file', async (c) => {
  const book = await findBook(c.env.DB, c.var.user.id, c.req.param('id'));
  if (!book) throw new ApiError(404, 'not_found', 'book not found');
  return streamObject(c, book.r2_key, 'application/epub+zip');
});

bookRoutes.get('/:id/cover', async (c) => {
  const book = await findBook(c.env.DB, c.var.user.id, c.req.param('id'));
  if (!book || !book.cover_r2_key) throw new ApiError(404, 'not_found', 'no cover');
  return streamObject(c, book.cover_r2_key, 'image/jpeg');
});

bookRoutes.patch('/:id', async (c) => {
  let body: { shared?: unknown };
  try {
    body = (await c.req.json()) as { shared?: unknown };
  } catch {
    throw new ApiError(400, 'validation', 'body must be JSON');
  }
  if (typeof body.shared !== 'boolean') throw new ApiError(400, 'validation', 'shared must be true or false');
  const ok = await setBookShared(c.env.DB, c.var.user.id, c.req.param('id'), body.shared);
  if (!ok) throw new ApiError(404, 'not_found', 'book not found');
  return c.json(await findBookWithProgress(c.env.DB, c.var.user.id, c.req.param('id')));
});

bookRoutes.delete('/:id', async (c) => {
  const book = await findBook(c.env.DB, c.var.user.id, c.req.param('id'));
  if (!book) throw new ApiError(404, 'not_found', 'book not found');
  await deleteBookAndBlob(c.env.DB, c.env.BOOKS, book);
  return c.body(null, 204);
});
