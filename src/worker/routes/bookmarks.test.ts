import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../app';
import { md5Hex } from '../services/crypto';
import { setSyncFetchForTests } from '../sync/syncService';
import { createUserAndLogin, jsonRequest, uploadFixture } from '../../../test/helpers';
import { createMockCrosspoint } from '../../../test/mockCrosspoint';
import { findBookmark } from '../db/bookmarks';
import { findBook } from '../db/books';
import type { BookmarkDto, BookmarksDto, BookmarkSyncResponse } from '../../shared/apiTypes';

const NEW = { xpath: '/body/DocFragment[3]/body/p[12]/text().0', percentage: 0.35, summary: 'It was the best of times', si: 2, chapter: 'Chapter 3' };

const list = async (bookId: string, cookie: string): Promise<BookmarksDto> => {
  const res = await app.request(`/api/books/${bookId}/bookmarks`, { headers: { cookie } }, env);
  expect(res.status).toBe(200);
  return res.json();
};

describe('bookmarks api', () => {
  let mock: ReturnType<typeof createMockCrosspoint>;
  beforeEach(() => {
    mock = createMockCrosspoint();
    setSyncFetchForTests(mock.fetch);
  });
  afterEach(() => setSyncFetchForTests(null));

  it('creates a bookmark and lists it', async () => {
    const { cookie } = await createUserAndLogin(env);
    const book = await uploadFixture(env, cookie);
    const res = await app.request(...jsonRequest(`/api/books/${book.id}/bookmarks`, 'POST', NEW, cookie), env);
    expect(res.status).toBe(201);
    const dto = (await res.json()) as BookmarkDto;
    expect(dto.id).toMatch(/^[0-9a-f]{16}$/);
    expect((await list(book.id, cookie)).bookmarks.map((b) => b.id)).toEqual([dto.id]);
  });

  it('is idempotent for the same xpath', async () => {
    const { cookie } = await createUserAndLogin(env);
    const book = await uploadFixture(env, cookie);
    await app.request(...jsonRequest(`/api/books/${book.id}/bookmarks`, 'POST', NEW, cookie), env);
    await app.request(...jsonRequest(`/api/books/${book.id}/bookmarks`, 'POST', { ...NEW, summary: 'second' }, cookie), env);
    const all = (await list(book.id, cookie)).bookmarks;
    expect(all).toHaveLength(1);
    expect(all[0]!.summary).toBe('second');
  });

  it('succeeds and leaves the row dirty when sync is unconfigured', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    const dto = await uploadFixture(env, cookie);
    const res = await app.request(...jsonRequest(`/api/books/${dto.id}/bookmarks`, 'POST', NEW, cookie), env);
    expect(res.status).toBe(201);
    const created = (await res.json()) as BookmarkDto;
    const book = (await findBook(env.DB, user.id, dto.id))!;
    expect((await findBookmark(env.DB, book.id, created.id))?.dirty).toBe(1);
  });

  it('deletes a bookmark and stops listing it', async () => {
    const { cookie } = await createUserAndLogin(env);
    const book = await uploadFixture(env, cookie);
    const created = (await (await app.request(...jsonRequest(`/api/books/${book.id}/bookmarks`, 'POST', NEW, cookie), env)).json()) as BookmarkDto;
    const del = await app.request(`/api/books/${book.id}/bookmarks/${created.id}`, { method: 'DELETE', headers: { cookie } }, env);
    expect(del.status).toBe(204);
    expect((await list(book.id, cookie)).bookmarks).toEqual([]);
  });

  it('404s on an unknown bookmark and on another user book', async () => {
    const other = await createUserAndLogin(env);
    const otherBook = await uploadFixture(env, other.cookie);
    const { cookie } = await createUserAndLogin(env);
    const book = await uploadFixture(env, cookie);
    const missing = await app.request(`/api/books/${book.id}/bookmarks/0123456789abcdef`, { method: 'DELETE', headers: { cookie } }, env);
    expect(missing.status).toBe(404);
    const foreign = await app.request(`/api/books/${otherBook.id}/bookmarks`, { headers: { cookie } }, env);
    expect(foreign.status).toBe(404);
  });

  it('rejects a bad xpath, percentage or summary', async () => {
    const { cookie } = await createUserAndLogin(env);
    const book = await uploadFixture(env, cookie);
    const bad = [
      { ...NEW, xpath: '' },
      { ...NEW, xpath: 'x'.repeat(513) },
      { ...NEW, percentage: 1.5 },
      { ...NEW, percentage: 'half' },
      { ...NEW, summary: 'x'.repeat(257) },
    ];
    for (const body of bad) {
      const res = await app.request(...jsonRequest(`/api/books/${book.id}/bookmarks`, 'POST', body, cookie), env);
      expect(res.status).toBe(400);
    }
  });

  it('pulls remote bookmarks on sync', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    mock.state.users.set('justin', await md5Hex('pw'));
    await app.request(...jsonRequest('/api/sync/settings', 'PUT', { enabled: true, serverUrl: 'https://sync.test', username: 'justin', password: 'pw', hashMethod: 'partial' }, cookie), env);
    const dto = await uploadFixture(env, cookie);
    const book = (await findBook(env.DB, user.id, dto.id))!;
    const forDoc = new Map();
    forDoc.set('aaaaaaaaaaaaaaaa', { id: 'aaaaaaaaaaaaaaaa', xpath: '/body/DocFragment[1]/body/p[1]/text().0', percentage: 0.1, summary: 'remote', si: 0, deleted: 0, updated_at: 500 });
    mock.state.bookmarks.set(book.hash_partial, forDoc);

    const res = await app.request(...jsonRequest(`/api/books/${dto.id}/bookmarks/sync`, 'POST', undefined, cookie), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as BookmarkSyncResponse;
    expect(body.syncError).toBeNull();
    expect(body.bookmarks.map((b) => b.summary)).toEqual(['remote']);
  });
});
