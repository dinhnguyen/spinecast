import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createUserAndLogin, uploadFixture } from '../../../test/helpers';
import { clearClippingDirty, findClipping, listClippings, listDirtyClippings, markClippingDeleted, setClippingCfi, upsertClipping, type ClippingRow } from './clippings';

const row = (bookId: string, id: string, over: Partial<ClippingRow> = {}): ClippingRow => ({
  id,
  book_id: bookId,
  spine: 1,
  start_page: null,
  end_page: null,
  pages: null,
  start_word: null,
  end_word: null,
  words: null,
  para: 4,
  chapter: 'Chapter 1',
  text: 'some highlighted words',
  note: null,
  color: '#f4e3a1',
  cfi: null,
  created_at: 1000,
  deleted: 0,
  updated_at: 1000,
  dirty: 1,
  ...over,
});

describe('clippings table', () => {
  it('orders by spine then para then created_at and hides tombstones', async () => {
    const { cookie } = await createUserAndLogin(env);
    const book = await uploadFixture(env, cookie);
    await upsertClipping(env.DB, row(book.id, 'c', { spine: 2, para: 1 }));
    await upsertClipping(env.DB, row(book.id, 'b', { spine: 1, para: 9, created_at: 50 }));
    await upsertClipping(env.DB, row(book.id, 'a', { spine: 1, para: 4 }));
    await upsertClipping(env.DB, row(book.id, 'a1', { spine: 1, para: 4, created_at: 500 }));
    await upsertClipping(env.DB, row(book.id, 'd', { spine: 0, deleted: 1 }));
    expect((await listClippings(env.DB, book.id)).map((r) => r.id)).toEqual(['a1', 'a', 'b', 'c']);
  });

  it('upserts by (book_id, id) rather than inserting twice', async () => {
    const { cookie } = await createUserAndLogin(env);
    const book = await uploadFixture(env, cookie);
    await upsertClipping(env.DB, row(book.id, 'a'));
    await upsertClipping(env.DB, row(book.id, 'a', { note: 'changed', updated_at: 2000 }));
    const all = await listClippings(env.DB, book.id);
    expect(all).toHaveLength(1);
    expect(all[0]!.note).toBe('changed');
  });

  it('keeps a local cfi and chapter when a pull sends none', async () => {
    const { cookie } = await createUserAndLogin(env);
    const book = await uploadFixture(env, cookie);
    await upsertClipping(env.DB, row(book.id, 'a', { cfi: 'epubcfi(/6/4!/4/2/2)', chapter: 'Chapter 1' }));
    await upsertClipping(env.DB, row(book.id, 'a', { cfi: null, chapter: null, note: 'from the device', updated_at: 2000 }));
    const stored = await findClipping(env.DB, book.id, 'a');
    expect(stored?.cfi).toBe('epubcfi(/6/4!/4/2/2)');
    expect(stored?.chapter).toBe('Chapter 1');
    expect(stored?.note).toBe('from the device');
  });

  it('overwrites old cfi with new cfi on upsert', async () => {
    const { cookie } = await createUserAndLogin(env);
    const book = await uploadFixture(env, cookie);
    await upsertClipping(env.DB, row(book.id, 'a', { cfi: 'epubcfi(/old)' }));
    await upsertClipping(env.DB, row(book.id, 'a', { cfi: 'epubcfi(/new)', updated_at: 2000 }));
    const stored = await findClipping(env.DB, book.id, 'a');
    expect(stored?.cfi).toBe('epubcfi(/new)');
  });

  it('sets a cfi without touching dirty or updated_at', async () => {
    const { cookie } = await createUserAndLogin(env);
    const book = await uploadFixture(env, cookie);
    await upsertClipping(env.DB, row(book.id, 'a', { dirty: 0, updated_at: 7000 }));
    await setClippingCfi(env.DB, book.id, 'a', 'epubcfi(/6/4!/4/2/2)');
    const stored = await findClipping(env.DB, book.id, 'a');
    expect(stored?.cfi).toBe('epubcfi(/6/4!/4/2/2)');
    expect(stored?.dirty).toBe(0);
    expect(stored?.updated_at).toBe(7000);
  });

  it('keeps a deleted row as a tombstone and reports a missing id', async () => {
    const { cookie } = await createUserAndLogin(env);
    const book = await uploadFixture(env, cookie);
    await upsertClipping(env.DB, row(book.id, 'a', { dirty: 0 }));
    expect(await markClippingDeleted(env.DB, book.id, 'a', 3000)).toBe(true);
    expect(await listClippings(env.DB, book.id)).toEqual([]);
    expect((await findClipping(env.DB, book.id, 'a'))?.deleted).toBe(1);
    expect(await markClippingDeleted(env.DB, book.id, 'nope', 3000)).toBe(false);
  });

  it('lists dirty rows including tombstones and clears only the dirty bit', async () => {
    const { cookie } = await createUserAndLogin(env);
    const book = await uploadFixture(env, cookie);
    await upsertClipping(env.DB, row(book.id, 'a', { dirty: 1 }));
    await upsertClipping(env.DB, row(book.id, 'b', { dirty: 0 }));
    await upsertClipping(env.DB, row(book.id, 'c', { dirty: 1, deleted: 1 }));
    expect((await listDirtyClippings(env.DB, book.id)).map((r) => r.id).sort()).toEqual(['a', 'c']);
    await clearClippingDirty(env.DB, book.id, ['a', 'c']);
    expect(await listDirtyClippings(env.DB, book.id)).toEqual([]);
    expect((await findClipping(env.DB, book.id, 'a'))?.updated_at).toBe(1000);
  });
});
