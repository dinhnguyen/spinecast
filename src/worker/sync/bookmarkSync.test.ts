import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../app';
import { md5Hex } from '../services/crypto';
import { setSyncFetchForTests } from './syncService';
import { pullBookmarks, pushBookmarks } from './bookmarkSync';
import { createUserAndLogin, jsonRequest, uploadFixture } from '../../../test/helpers';
import { createMockCrosspoint } from '../../../test/mockCrosspoint';
import { findBook } from '../db/books';
import { findBookmark, listBookmarks, upsertBookmark, type BookmarkRow } from '../db/bookmarks';
import { getCursor, setCursor } from '../db/syncCursors';
import type { RemoteBookmark } from './crosspointClient';

const setCursorToZero = (e: typeof env, userId: string, bookId: string) => setCursor(e.DB, userId, bookId, 'bookmarks', 0);

const configure = async (cookie: string, mock: ReturnType<typeof createMockCrosspoint>) => {
  mock.state.users.set('justin', await md5Hex('pw'));
  await app.request(
    ...jsonRequest('/api/sync/settings', 'PUT', { enabled: true, serverUrl: 'https://sync.test', username: 'justin', password: 'pw', hashMethod: 'partial' }, cookie),
    env,
  );
};

const row = (bookId: string, id: string, percentage: number, over: Partial<BookmarkRow> = {}): BookmarkRow => ({
  id, book_id: bookId, xpath: `/body/DocFragment[1]/body/p[${id}]/text().0`, percentage,
  summary: 'text', si: 0, pc: null, pp: null, chapter: null, deleted: 0, updated_at: 1000, dirty: 1, ...over,
});

describe('bookmark sync', () => {
  let mock: ReturnType<typeof createMockCrosspoint>;
  beforeEach(() => {
    mock = createMockCrosspoint();
    setSyncFetchForTests(mock.fetch);
  });
  afterEach(() => setSyncFetchForTests(null));

  it('pushes rows and reports success', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    await configure(cookie, mock);
    const dto = await uploadFixture(env, cookie);
    const book = (await findBook(env.DB, user.id, dto.id))!;
    const res = await pushBookmarks(env, user.id, book, [row(book.id, 'aaa', 0.2)]);
    expect(res).toEqual({ pushed: true, error: null });
    expect(mock.state.bookmarks.get(book.hash_partial)?.get('aaa')?.percentage).toBe(0.2);
  });

  it('sends a delete as an id and a deleted flag', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    await configure(cookie, mock);
    const dto = await uploadFixture(env, cookie);
    const book = (await findBook(env.DB, user.id, dto.id))!;
    await pushBookmarks(env, user.id, book, [row(book.id, 'aaa', 0.2, { deleted: 1 })]);
    expect(mock.state.bookmarks.get(book.hash_partial)?.get('aaa')?.deleted).toBe(1);
  });

  it('is a no-op that reports no error when sync is unconfigured', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    const dto = await uploadFixture(env, cookie);
    const book = (await findBook(env.DB, user.id, dto.id))!;
    expect(await pushBookmarks(env, user.id, book, [row(book.id, 'aaa', 0.2)])).toEqual({ pushed: false, error: null });
    expect(await pullBookmarks(env, user.id, book)).toEqual({ merged: 0, error: null });
  });

  it('pulls every page rather than stopping after the first', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    await configure(cookie, mock);
    const dto = await uploadFixture(env, cookie);
    const book = (await findBook(env.DB, user.id, dto.id))!;
    // Seed the server directly rather than pushing: a push would create the local rows
    // itself, and the length assertion would pass even if the pull loop did nothing.
    const remote = new Map<string, RemoteBookmark>();
    for (let i = 0; i < 120; i += 1) {
      const id = String(i).padStart(16, '0');
      remote.set(id, {
        id,
        xpath: `/body/DocFragment[1]/body/p[${i}]/text().0`,
        percentage: i / 1000,
        summary: `s${i}`,
        si: 0,
        pc: null,
        pp: null,
        deleted: 0,
        updated_at: 1000 + i,
      });
    }
    mock.state.bookmarks.set(book.hash_partial, remote);
    const res = await pullBookmarks(env, user.id, book);
    expect(res.error).toBeNull();
    expect(res.merged).toBe(120);
    expect(await listBookmarks(env.DB, book.id)).toHaveLength(120);
    expect(await getCursor(env.DB, user.id, book.id, 'bookmarks')).toBeGreaterThan(0);
  });

  it('lets a newer server row win and an older one lose', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    await configure(cookie, mock);
    const dto = await uploadFixture(env, cookie);
    const book = (await findBook(env.DB, user.id, dto.id))!;
    await pushBookmarks(env, user.id, book, [row(book.id, 'aaa', 0.2, { summary: 'from server' })]);
    await upsertBookmark(env.DB, row(book.id, 'aaa', 0.2, { summary: 'stale local', updated_at: 1, dirty: 0 }));
    await pullBookmarks(env, user.id, book);
    expect((await findBookmark(env.DB, book.id, 'aaa'))?.summary).toBe('from server');

    await upsertBookmark(env.DB, row(book.id, 'aaa', 0.2, { summary: 'newer local', updated_at: 9_999_999_999, dirty: 0 }));
    await setCursorToZero(env, user.id, book.id);
    await pullBookmarks(env, user.id, book);
    expect((await findBookmark(env.DB, book.id, 'aaa'))?.summary).toBe('newer local');
  });

  it('keeps the row dirty and reports the error when the push fails', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    await configure(cookie, mock);
    const dto = await uploadFixture(env, cookie);
    const book = (await findBook(env.DB, user.id, dto.id))!;
    await upsertBookmark(env.DB, row(book.id, 'aaa', 0.2, { dirty: 1 }));
    // The sync server now rejects this user, so the push fails on a real error
    // rather than on the unconfigured path.
    mock.state.users.delete('justin');
    const res = await pushBookmarks(env, user.id, book, [row(book.id, 'aaa', 0.2)]);
    expect(res.pushed).toBe(false);
    expect(res.error).toContain('unauthorized');
    expect((await findBookmark(env.DB, book.id, 'aaa'))?.dirty).toBe(1);
  });

  it('applies a tombstone from the server', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    await configure(cookie, mock);
    const dto = await uploadFixture(env, cookie);
    const book = (await findBook(env.DB, user.id, dto.id))!;
    await pushBookmarks(env, user.id, book, [row(book.id, 'aaa', 0.2)]);
    await pullBookmarks(env, user.id, book);
    expect(await listBookmarks(env.DB, book.id)).toHaveLength(1);

    // The delete originates on another device, not this client: mutate the server's copy
    // directly with a strictly later updated_at, rather than pushing the delete ourselves.
    const forDoc = mock.state.bookmarks.get(book.hash_partial)!;
    const existing = forDoc.get('aaa')!;
    forDoc.set('aaa', { ...existing, deleted: 1, updated_at: existing.updated_at + 1 });

    await pullBookmarks(env, user.id, book);
    expect(await listBookmarks(env.DB, book.id)).toEqual([]);
    expect((await findBookmark(env.DB, book.id, 'aaa'))?.deleted).toBe(1);
  });
});
