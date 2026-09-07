import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { app } from '../app';
import { createUserAndLogin, jsonRequest, uploadFixture } from '../../../test/helpers';
import { findBook, type BookRow } from '../db/books';
import { pullDelta, pushDelta, type DeltaKind, type RemoteBase } from './deltaSync';

// A fake entity over an in-memory array, so the loop itself is exercised without
// either real entity (bookmarks or clippings).
interface FakeRow {
  id: string;
}

type FakeRemote = RemoteBase;

type FakePutItem = { id: string };

const configure = async (cookie: string) => {
  await app.request(
    ...jsonRequest('/api/sync/settings', 'PUT', { enabled: true, serverUrl: 'https://sync.test', username: 'justin', password: 'pw', hashMethod: 'partial' }, cookie),
    env,
  );
};

const setup = async (): Promise<{ userId: string; book: BookRow }> => {
  const { user, cookie } = await createUserAndLogin(env);
  await configure(cookie);
  const dto = await uploadFixture(env, cookie);
  const book = (await findBook(env.DB, user.id, dto.id))!;
  return { userId: user.id, book };
};

describe('pushDelta', () => {
  it('chunks 120 rows into puts of 50, 50 and 20, and clears dirty per chunk', async () => {
    const { userId, book } = await setup();
    const rows: FakeRow[] = Array.from({ length: 120 }, (_, i) => ({ id: `r${i}` }));
    const putChunks: FakePutItem[][] = [];
    const clearedIds: string[][] = [];
    const kind: DeltaKind<FakeRow, FakeRemote, FakePutItem> = {
      kind: 'bookmarks',
      toPutItem: (r) => ({ id: r.id }),
      put: async (_client, _document, items) => {
        putChunks.push(items);
        return { until: 0, accepted: items.length };
      },
      get: async () => ({ until: 0, more: false, items: [] }),
      clearDirty: async (_db, _bookId, ids) => {
        clearedIds.push(ids);
      },
      merge: async () => false,
    };

    const res = await pushDelta(env, userId, book, rows, kind);

    expect(res).toEqual({ pushed: true, error: null });
    expect(putChunks.map((c) => c.length)).toEqual([50, 50, 20]);
    expect(clearedIds).toEqual(putChunks.map((c) => c.map((i) => i.id)));
  });
});

describe('pullDelta', () => {
  it('walks two pages and stops once more is false', async () => {
    const { userId, book } = await setup();
    let calls = 0;
    const kind: DeltaKind<FakeRow, FakeRemote, FakePutItem> = {
      kind: 'bookmarks',
      toPutItem: (r) => ({ id: r.id }),
      put: async () => ({ until: 0, accepted: 0 }),
      get: async (_client, _document, since) => {
        calls += 1;
        const until = since + 10;
        return calls === 1
          ? { until, more: true, items: [{ id: 'a', deleted: 0, updated_at: until }] }
          : { until, more: false, items: [{ id: 'b', deleted: 0, updated_at: until }] };
      },
      clearDirty: async () => {},
      merge: async () => true,
    };

    const res = await pullDelta(env, userId, book, kind);

    expect(calls).toBe(2);
    expect(res).toEqual({ merged: 2, error: null });
  });

  it('stops after one page when until does not advance', async () => {
    const { userId, book } = await setup();
    let calls = 0;
    const kind: DeltaKind<FakeRow, FakeRemote, FakePutItem> = {
      kind: 'bookmarks',
      toPutItem: (r) => ({ id: r.id }),
      put: async () => ({ until: 0, accepted: 0 }),
      get: async (_client, _document, since) => {
        calls += 1;
        return { until: since, more: true, items: [{ id: 'a', deleted: 0, updated_at: since }] };
      },
      clearDirty: async () => {},
      merge: async () => true,
    };

    const res = await pullDelta(env, userId, book, kind);

    expect(calls).toBe(1);
    expect(res).toEqual({ merged: 1, error: null });
  });

  it('caps at MAX_PAGES against a server that always advances and always has more', async () => {
    const { userId, book } = await setup();
    let calls = 0;
    const kind: DeltaKind<FakeRow, FakeRemote, FakePutItem> = {
      kind: 'bookmarks',
      toPutItem: (r) => ({ id: r.id }),
      put: async () => ({ until: 0, accepted: 0 }),
      get: async (_client, _document, since) => {
        calls += 1;
        const until = since + 1;
        return { until, more: true, items: [{ id: `x${calls}`, deleted: 0, updated_at: until }] };
      },
      clearDirty: async () => {},
      merge: async () => true,
    };

    const res = await pullDelta(env, userId, book, kind);

    expect(calls).toBe(100);
    expect(res).toEqual({ merged: 100, error: null });
  });
});
