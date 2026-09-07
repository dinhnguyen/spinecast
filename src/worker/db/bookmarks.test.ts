import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createUserAndLogin, uploadFixture } from '../../../test/helpers';
import { clearBookmarkDirty, findBookmark, listBookmarks, listDirtyBookmarks, markBookmarkDeleted, upsertBookmark, type BookmarkRow } from './bookmarks';
import { getCursor, setCursor } from './syncCursors';

const row = (bookId: string, id: string, percentage: number, over: Partial<BookmarkRow> = {}): BookmarkRow => ({
  id,
  book_id: bookId,
  xpath: `/body/DocFragment[1]/body/p[${id}]/text().0`,
  percentage,
  summary: 'some text',
  si: 0,
  pc: null,
  pp: null,
  chapter: 'Chapter 1',
  deleted: 0,
  updated_at: 1000,
  dirty: 1,
  ...over,
});

describe('bookmarks table', () => {
  it('lists non-deleted rows ordered by percentage', async () => {
    const { cookie } = await createUserAndLogin(env);
    const book = await uploadFixture(env, cookie);
    await upsertBookmark(env.DB, row(book.id, 'bbb', 0.7));
    await upsertBookmark(env.DB, row(book.id, 'aaa', 0.2));
    await upsertBookmark(env.DB, row(book.id, 'ccc', 0.9, { deleted: 1 }));
    expect((await listBookmarks(env.DB, book.id)).map((r) => r.id)).toEqual(['aaa', 'bbb']);
  });

  it('upserts by (book_id, id) rather than inserting twice', async () => {
    const { cookie } = await createUserAndLogin(env);
    const book = await uploadFixture(env, cookie);
    await upsertBookmark(env.DB, row(book.id, 'aaa', 0.2));
    await upsertBookmark(env.DB, row(book.id, 'aaa', 0.2, { summary: 'changed', updated_at: 2000 }));
    const all = await listBookmarks(env.DB, book.id);
    expect(all).toHaveLength(1);
    expect(all[0]!.summary).toBe('changed');
  });

  it('preserves local chapter on pull when remote has none', async () => {
    const { cookie } = await createUserAndLogin(env);
    const book = await uploadFixture(env, cookie);
    await upsertBookmark(env.DB, row(book.id, 'aaa', 0.2, { chapter: 'Chapter 1' }));
    await upsertBookmark(env.DB, row(book.id, 'aaa', 0.2, { chapter: null, summary: 'remote summary', updated_at: 2000 }));
    const updated = await findBookmark(env.DB, book.id, 'aaa');
    expect(updated?.chapter).toBe('Chapter 1');
    expect(updated?.summary).toBe('remote summary');
  });

  it('keeps the row as a tombstone when deleted', async () => {
    const { cookie } = await createUserAndLogin(env);
    const book = await uploadFixture(env, cookie);
    await upsertBookmark(env.DB, row(book.id, 'aaa', 0.2, { dirty: 0 }));
    expect(await markBookmarkDeleted(env.DB, book.id, 'aaa', 3000)).toBe(true);
    expect(await listBookmarks(env.DB, book.id)).toEqual([]);
    const gone = await findBookmark(env.DB, book.id, 'aaa');
    expect(gone?.deleted).toBe(1);
    expect(gone?.dirty).toBe(1);
    expect(gone?.updated_at).toBe(3000);
  });

  it('reports a missing id rather than pretending to delete it', async () => {
    const { cookie } = await createUserAndLogin(env);
    const book = await uploadFixture(env, cookie);
    expect(await markBookmarkDeleted(env.DB, book.id, 'nope', 3000)).toBe(false);
  });

  it('lists dirty rows including tombstones, and clears them', async () => {
    const { cookie } = await createUserAndLogin(env);
    const book = await uploadFixture(env, cookie);
    await upsertBookmark(env.DB, row(book.id, 'aaa', 0.2, { dirty: 1 }));
    await upsertBookmark(env.DB, row(book.id, 'bbb', 0.4, { dirty: 0 }));
    await upsertBookmark(env.DB, row(book.id, 'ccc', 0.6, { dirty: 1, deleted: 1 }));
    expect((await listDirtyBookmarks(env.DB, book.id)).map((r) => r.id).sort()).toEqual(['aaa', 'ccc']);
    await clearBookmarkDirty(env.DB, book.id, ['aaa', 'ccc']);
    expect(await listDirtyBookmarks(env.DB, book.id)).toEqual([]);
    // Clearing dirty must not touch updated_at: the server owns that clock, and only a
    // later pull should ever move it.
    expect((await findBookmark(env.DB, book.id, 'aaa'))?.updated_at).toBe(1000);
  });
});

describe('sync cursors', () => {
  it('starts at zero and round-trips per book and kind', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    const book = await uploadFixture(env, cookie);
    expect(await getCursor(env.DB, user.id, book.id, 'bookmarks')).toBe(0);
    await setCursor(env.DB, user.id, book.id, 'bookmarks', 1752345678);
    expect(await getCursor(env.DB, user.id, book.id, 'bookmarks')).toBe(1752345678);
    expect(await getCursor(env.DB, user.id, book.id, 'clippings')).toBe(0);
  });
});
