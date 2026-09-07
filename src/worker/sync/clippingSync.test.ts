import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../app';
import { md5Hex } from '../services/crypto';
import { setSyncFetchForTests } from './syncService';
import { pullClippings, pushClippings } from './clippingSync';
import { createUserAndLogin, jsonRequest, uploadFixture } from '../../../test/helpers';
import { createMockCrosspoint } from '../../../test/mockCrosspoint';
import { findBook } from '../db/books';
import { findClipping, listClippings, upsertClipping, type ClippingRow } from '../db/clippings';
import { getCursor } from '../db/syncCursors';
import type { RemoteClipping } from './crosspointClient';

const configure = async (cookie: string, mock: ReturnType<typeof createMockCrosspoint>) => {
  mock.state.users.set('justin', await md5Hex('pw'));
  await app.request(
    ...jsonRequest('/api/sync/settings', 'PUT', { enabled: true, serverUrl: 'https://sync.test', username: 'justin', password: 'pw', hashMethod: 'partial' }, cookie),
    env,
  );
};

const row = (bookId: string, id: string, over: Partial<ClippingRow> = {}): ClippingRow => ({
  id, book_id: bookId, spine: 1, start_page: 1, end_page: 1, pages: 1, start_word: 0, end_word: 10,
  words: 10, para: 0, chapter: 'Ch 1', text: 'highlighted text', note: null, color: null, cfi: null,
  created_at: 1000, deleted: 0, updated_at: 1000, dirty: 1, ...over,
});

describe('clipping sync', () => {
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
    const res = await pushClippings(env, user.id, book, [row(book.id, 'aaa')]);
    expect(res).toEqual({ pushed: true, error: null });
    expect(mock.state.clippings.get(book.hash_partial)?.get('aaa')?.text).toBe('highlighted text');
  });

  it('sends a delete as an id and a deleted flag, nothing else', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    await configure(cookie, mock);
    const dto = await uploadFixture(env, cookie);
    const book = (await findBook(env.DB, user.id, dto.id))!;
    await pushClippings(env, user.id, book, [row(book.id, 'aaa', { deleted: 1 })]);
    const stored = mock.state.clippings.get(book.hash_partial)?.get('aaa');
    expect(stored?.deleted).toBe(1);
    expect(stored).not.toHaveProperty('text');
    expect(stored).not.toHaveProperty('spine');
    expect(stored).not.toHaveProperty('color');
    expect(stored).not.toHaveProperty('chapter');
  });

  it('is a no-op that reports no error when sync is unconfigured', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    const dto = await uploadFixture(env, cookie);
    const book = (await findBook(env.DB, user.id, dto.id))!;
    expect(await pushClippings(env, user.id, book, [row(book.id, 'aaa')])).toEqual({ pushed: false, error: null });
    expect(await pullClippings(env, user.id, book)).toEqual({ merged: 0, error: null });
  });

  it('pulls every page rather than stopping after the first', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    await configure(cookie, mock);
    const dto = await uploadFixture(env, cookie);
    const book = (await findBook(env.DB, user.id, dto.id))!;
    // Seed the server directly rather than pushing: a push would create the local rows
    // itself, and the length assertion would pass even if the pull loop did nothing.
    const remote = new Map<string, RemoteClipping>();
    for (let i = 0; i < 120; i += 1) {
      const id = String(i).padStart(16, '0');
      remote.set(id, {
        id,
        spine: 1,
        start_page: 1,
        end_page: 1,
        pages: 1,
        start_word: 0,
        end_word: 10,
        words: 10,
        para: i,
        chapter: 'Ch 1',
        text: `clip ${i}`,
        note: null,
        color: null,
        created_at: 1000,
        deleted: 0,
        updated_at: 1000 + i,
      });
    }
    mock.state.clippings.set(book.hash_partial, remote);
    const res = await pullClippings(env, user.id, book);
    expect(res.error).toBeNull();
    expect(res.merged).toBe(120);
    expect(await listClippings(env.DB, book.id)).toHaveLength(120);
    expect(await getCursor(env.DB, user.id, book.id, 'clippings')).toBeGreaterThan(0);
  });

  it('lets a newer server row win and an older one lose', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    await configure(cookie, mock);
    const dto = await uploadFixture(env, cookie);
    const book = (await findBook(env.DB, user.id, dto.id))!;
    const remote = new Map<string, RemoteClipping>();
    remote.set('aaa', {
      id: 'aaa', spine: 1, start_page: 1, end_page: 1, pages: 1, start_word: 0, end_word: 10,
      words: 10, para: 0, chapter: 'Ch 1', text: 'from server', note: null, color: null,
      created_at: 1000, deleted: 0, updated_at: 5000,
    });
    mock.state.clippings.set(book.hash_partial, remote);

    await upsertClipping(env.DB, row(book.id, 'aaa', { text: 'stale local', updated_at: 1, dirty: 0 }));
    await pullClippings(env, user.id, book);
    expect((await findClipping(env.DB, book.id, 'aaa'))?.text).toBe('from server');

    await upsertClipping(env.DB, row(book.id, 'aaa', { text: 'newer local', updated_at: 9_999_999_999, dirty: 0 }));
    remote.set('aaa', { ...remote.get('aaa')!, text: 'from server again', updated_at: 5001 });
    await pullClippings(env, user.id, book);
    expect((await findClipping(env.DB, book.id, 'aaa'))?.text).toBe('newer local');
  });

  it('does not re-apply a remote row carrying the same updated_at as the local one', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    await configure(cookie, mock);
    const dto = await uploadFixture(env, cookie);
    const book = (await findBook(env.DB, user.id, dto.id))!;
    await upsertClipping(env.DB, row(book.id, 'aaa', { text: 'local text', updated_at: 5000, dirty: 0 }));

    const remote = new Map<string, RemoteClipping>();
    remote.set('aaa', {
      id: 'aaa', spine: 1, start_page: 1, end_page: 1, pages: 1, start_word: 0, end_word: 10,
      words: 10, para: 0, chapter: 'Ch 1', text: 'remote text', note: null, color: null,
      created_at: 1000, deleted: 0, updated_at: 5000,
    });
    mock.state.clippings.set(book.hash_partial, remote);

    const res = await pullClippings(env, user.id, book);
    expect(res.merged).toBe(0);
    expect((await findClipping(env.DB, book.id, 'aaa'))?.text).toBe('local text');
  });

  it('applies a tombstone from the server', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    await configure(cookie, mock);
    const dto = await uploadFixture(env, cookie);
    const book = (await findBook(env.DB, user.id, dto.id))!;
    const remote = new Map<string, RemoteClipping>();
    remote.set('aaa', {
      id: 'aaa', spine: 1, start_page: 1, end_page: 1, pages: 1, start_word: 0, end_word: 10,
      words: 10, para: 0, chapter: 'Ch 1', text: 'a clip', note: null, color: null,
      created_at: 1000, deleted: 0, updated_at: 1000,
    });
    mock.state.clippings.set(book.hash_partial, remote);
    await pullClippings(env, user.id, book);
    expect(await listClippings(env.DB, book.id)).toHaveLength(1);

    // The delete originates on another device, not this client: mutate the server's copy
    // directly with a strictly later updated_at, rather than pushing the delete ourselves.
    const forDoc = mock.state.clippings.get(book.hash_partial)!;
    const existing = forDoc.get('aaa')!;
    forDoc.set('aaa', { ...existing, deleted: 1, updated_at: existing.updated_at + 1 });

    await pullClippings(env, user.id, book);
    expect(await listClippings(env.DB, book.id)).toEqual([]);
    expect((await findClipping(env.DB, book.id, 'aaa'))?.deleted).toBe(1);
  });

  it('never puts cfi in a pushed payload', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    await configure(cookie, mock);
    const dto = await uploadFixture(env, cookie);
    const book = (await findBook(env.DB, user.id, dto.id))!;
    await pushClippings(env, user.id, book, [row(book.id, 'aaa', { cfi: 'epubcfi(/6/4!/4/2/1:0)' })]);
    const stored = mock.state.clippings.get(book.hash_partial)?.get('aaa');
    expect(stored).toBeDefined();
    expect(stored).not.toHaveProperty('cfi');
  });

  it('does not erase a local cfi on pull', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    await configure(cookie, mock);
    const dto = await uploadFixture(env, cookie);
    const book = (await findBook(env.DB, user.id, dto.id))!;
    await upsertClipping(env.DB, row(book.id, 'aaa', { cfi: 'epubcfi(/6/4!/4/2/1:0)', updated_at: 1000, dirty: 0 }));

    const remote = new Map<string, RemoteClipping>();
    remote.set('aaa', {
      id: 'aaa', spine: 1, start_page: 1, end_page: 1, pages: 1, start_word: 0, end_word: 10,
      words: 10, para: 0, chapter: 'Ch 1', text: 'updated from server', note: null, color: null,
      created_at: 1000, deleted: 0, updated_at: 2000,
    });
    mock.state.clippings.set(book.hash_partial, remote);

    await pullClippings(env, user.id, book);
    const merged = await findClipping(env.DB, book.id, 'aaa');
    expect(merged?.text).toBe('updated from server');
    expect(merged?.cfi).toBe('epubcfi(/6/4!/4/2/1:0)');
  });
});
