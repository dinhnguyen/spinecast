import { Hono } from 'hono';
import type { Position } from '../src/shared/position';
import type { PutBookmarkItem, PutClippingItem, RemoteBookmark, RemoteClipping } from '../src/worker/sync/crosspointClient';

export interface MockProgress {
  document: string;
  progress: string;
  percentage: number;
  device: string;
  device_id: string;
  timestamp: number;
  position?: Position;
  metadata?: { filename?: string; title?: string; authors?: string };
}

export const createMockCrosspoint = () => {
  const users = new Map<string, string>([['justin', '0f359740bd1cda994f8b55330c86d845']]);
  const progress = new Map<string, MockProgress>();
  const bookmarks = new Map<string, Map<string, RemoteBookmark>>();
  const clippings = new Map<string, Map<string, RemoteClipping>>();
  let now = 1_752_345_678;
  const app = new Hono();

  const authed = (c: { req: { header: (n: string) => string | undefined } }): boolean => {
    const u = c.req.header('x-auth-user');
    const k = c.req.header('x-auth-key');
    return !!u && !!k && users.get(u) === k;
  };
  const unauthorized = (c: { json: (b: unknown, s: 401) => Response }) => c.json({ code: 2001, message: 'Unauthorized' }, 401);

  app.get('/healthz', (c) => c.json({ status: 'ok', version: 'mock' }));
  app.get('/users/auth', (c) => (authed(c) ? c.json({ authorized: 'OK' }) : unauthorized(c)));
  app.put('/api/v1/progress', async (c) => {
    if (!authed(c)) return unauthorized(c);
    const body = (await c.req.json()) as Partial<MockProgress>;
    if (!body.document || !/^[A-Za-z0-9._-]{1,64}$/.test(body.document)) return c.json({ code: 2004, message: 'Missing document' }, 403);
    now += 1;
    progress.set(body.document, { ...(body as MockProgress), timestamp: now });
    return c.json({ document: body.document, timestamp: now });
  });
  app.get('/syncs/progress/:document', (c) => {
    if (!authed(c)) return unauthorized(c);
    const p = progress.get(c.req.param('document'));
    if (!p) return c.json({});
    const { position: _p, metadata: _m, ...rest } = p;
    return c.json(rest);
  });
  app.get('/api/v1/progress/:document', (c) => {
    if (!authed(c)) return unauthorized(c);
    const p = progress.get(c.req.param('document'));
    return c.json({ document: c.req.param('document'), devices: p ? [{ ...p, position: p.position ?? null }] : [] });
  });
  app.get('/api/v1/progress', (c) => {
    if (!authed(c)) return unauthorized(c);
    const items = [...progress.values()]
      .sort((a, b) => b.timestamp - a.timestamp)
      .map((p) => ({
        document: p.document,
        title: p.metadata?.title ?? null,
        author: p.metadata?.authors ?? null,
        filename: p.metadata?.filename ?? null,
        percentage: p.percentage,
        progress: p.progress,
        device_id: p.device_id,
        device: p.device,
        timestamp: p.timestamp,
      }));
    return c.json({ items });
  });

  app.get('/api/v1/bookmarks/:document', (c) => {
    if (!authed(c)) return unauthorized(c);
    const since = Number(c.req.query('since') ?? 0);
    const limit = Math.min(Number(c.req.query('limit') ?? 50), 100);
    const doc = c.req.param('document');
    const all = [...(bookmarks.get(doc)?.values() ?? [])]
      .filter((b) => b.updated_at > since)
      .sort((a, b) => a.updated_at - b.updated_at);
    const items = all.slice(0, limit);
    const until = items.length > 0 ? items[items.length - 1]!.updated_at : since;
    return c.json({ document: doc, until, more: all.length > items.length, items });
  });

  app.put('/api/v1/bookmarks/:document', async (c) => {
    if (!authed(c)) return unauthorized(c);
    const body = (await c.req.json()) as { items?: PutBookmarkItem[] };
    const items = body.items ?? [];
    if (items.length > 50) return c.json({ code: 2005, message: 'Batch too large' }, 400);
    const doc = c.req.param('document');
    const forDoc = bookmarks.get(doc) ?? new Map<string, RemoteBookmark>();
    bookmarks.set(doc, forDoc);
    // Each item gets its own tick. Sharing one timestamp across a batch would let a
    // paged read cut a group in half and skip its tail, which is a server-side
    // hazard this mock has no business reproducing.
    for (const item of items) {
      now += 1;
      const prev = forDoc.get(item.id);
      forDoc.set(item.id, { ...prev, ...item, deleted: item.deleted ?? 0, updated_at: now } as RemoteBookmark);
    }
    return c.json({ until: now, accepted: items.length });
  });

  app.get('/api/v1/clippings/:document', (c) => {
    if (!authed(c)) return unauthorized(c);
    const since = Number(c.req.query('since') ?? 0);
    const limit = Math.min(Number(c.req.query('limit') ?? 50), 100);
    const doc = c.req.param('document');
    const all = [...(clippings.get(doc)?.values() ?? [])]
      .filter((cl) => cl.updated_at > since)
      .sort((a, b) => a.updated_at - b.updated_at);
    const items = all.slice(0, limit);
    const until = items.length > 0 ? items[items.length - 1]!.updated_at : since;
    return c.json({ document: doc, until, more: all.length > items.length, items });
  });

  app.put('/api/v1/clippings/:document', async (c) => {
    if (!authed(c)) return unauthorized(c);
    const body = (await c.req.json()) as { items?: PutClippingItem[] };
    const items = body.items ?? [];
    if (items.length > 50) return c.json({ code: 2005, message: 'Batch too large' }, 400);
    const doc = c.req.param('document');
    const forDoc = clippings.get(doc) ?? new Map<string, RemoteClipping>();
    clippings.set(doc, forDoc);
    // Each item gets its own tick. Sharing one timestamp across a batch would let a
    // paged read cut a group in half and skip its tail, which is a server-side
    // hazard this mock has no business reproducing.
    for (const item of items) {
      now += 1;
      const prev = forDoc.get(item.id);
      forDoc.set(item.id, { ...prev, ...item, deleted: item.deleted ?? 0, updated_at: now } as RemoteClipping);
    }
    return c.json({ until: now, accepted: items.length });
  });

  const fetchImpl: typeof fetch = (input, init) => Promise.resolve(app.request(input instanceof Request ? input : String(input), init));
  return { app, fetch: fetchImpl, state: { users, progress, bookmarks, clippings } };
};
