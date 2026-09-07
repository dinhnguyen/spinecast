import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createUser } from '../../../test/helpers';
import { insertBook, type BookRow } from './books';
import { countSharedBooks, findOpdsBook, listOpdsAuthors, listOpdsBooks, OPDS_PAGE_SIZE } from './opdsBooks';

const seed = async (userId: string, i: number, over: Partial<BookRow> = {}): Promise<BookRow> => {
  const row: BookRow = {
    id: `${userId}-b${String(i).padStart(3, '0')}`,
    user_id: userId,
    title: `Book ${String(i).padStart(3, '0')}`,
    author: i % 2 === 0 ? 'Even Author' : 'Odd Author',
    filename: `book-${i}.epub`,
    filesize: 10,
    r2_key: `users/${userId}/books/b${i}.epub`,
    cover_r2_key: null,
    shared: 0,
    hash_partial: `${userId}-hp${i}`,
    hash_filename: `hf${i}`,
    created_at: 1000 + i,
    last_opened_at: null,
    source_catalog_id: null,
    source_entry_id: null,
    ...over,
  };
  await insertBook(env.DB, row);
  if (row.shared) await env.DB.prepare('update books set shared = 1 where id = ?').bind(row.id).run();
  return row;
};

describe('opds book queries', () => {
  it('pages by title and reports hasMore only when more rows exist', async () => {
    const u = await createUser(env);
    for (let i = 1; i <= OPDS_PAGE_SIZE + 1; i++) await seed(u.id, i);
    const p1 = await listOpdsBooks(env.DB, u.id, 'library', { order: 'title', page: 1 });
    expect(p1.rows).toHaveLength(OPDS_PAGE_SIZE);
    expect(p1.rows[0]!.title).toBe('Book 001');
    expect(p1.hasMore).toBe(true);
    const p2 = await listOpdsBooks(env.DB, u.id, 'library', { order: 'title', page: 2 });
    expect(p2.rows).toHaveLength(1);
    expect(p2.hasMore).toBe(false);
  });

  it('orders recent by created_at desc', async () => {
    const u = await createUser(env);
    await seed(u.id, 1);
    await seed(u.id, 2);
    const p = await listOpdsBooks(env.DB, u.id, 'library', { order: 'recent', page: 1 });
    expect(p.rows.map((r) => r.title)).toEqual(['Book 002', 'Book 001']);
  });

  it('public scope only returns shared books, library returns all', async () => {
    const u = await createUser(env);
    await seed(u.id, 1);
    const shared = await seed(u.id, 2, { shared: 1 });
    expect((await listOpdsBooks(env.DB, u.id, 'library', { order: 'title', page: 1 })).rows).toHaveLength(2);
    const pub = await listOpdsBooks(env.DB, u.id, 'public', { order: 'title', page: 1 });
    expect(pub.rows.map((r) => r.id)).toEqual([shared.id]);
    expect(await findOpdsBook(env.DB, u.id, 'public', shared.id)).not.toBeNull();
    expect(await findOpdsBook(env.DB, u.id, 'public', `${u.id}-b001`)).toBeNull();
    expect(await findOpdsBook(env.DB, u.id, 'library', `${u.id}-b001`)).not.toBeNull();
    expect(await countSharedBooks(env.DB, u.id)).toBe(1);
  });

  it('never crosses users', async () => {
    const a = await createUser(env);
    const b = await createUser(env);
    const ab = await seed(a.id, 1, { shared: 1 });
    expect((await listOpdsBooks(env.DB, b.id, 'library', { order: 'title', page: 1 })).rows).toHaveLength(0);
    expect(await findOpdsBook(env.DB, b.id, 'library', ab.id)).toBeNull();
  });

  it('groups authors with counts and filters by author', async () => {
    const u = await createUser(env);
    await seed(u.id, 1);
    await seed(u.id, 2);
    await seed(u.id, 3);
    await seed(u.id, 4, { author: '' });
    const authors = await listOpdsAuthors(env.DB, u.id, 'library');
    expect(authors).toEqual([
      { author: '', count: 1 },
      { author: 'Even Author', count: 1 },
      { author: 'Odd Author', count: 2 },
    ]);
    const odd = await listOpdsBooks(env.DB, u.id, 'library', { order: 'title', page: 1, author: 'Odd Author' });
    expect(odd.rows.map((r) => r.title)).toEqual(['Book 001', 'Book 003']);
    const none = await listOpdsBooks(env.DB, u.id, 'library', { order: 'title', page: 1, author: '' });
    expect(none.rows.map((r) => r.title)).toEqual(['Book 004']);
  });

  it('searches title and author case-insensitively', async () => {
    const u = await createUser(env);
    await seed(u.id, 1, { title: 'Truyện Kiều', author: 'Nguyễn Du' });
    await seed(u.id, 2, { title: 'Số đỏ', author: 'Vũ Trọng Phụng' });
    expect((await listOpdsBooks(env.DB, u.id, 'library', { order: 'title', page: 1, q: 'kiều' })).rows).toHaveLength(1);
    expect((await listOpdsBooks(env.DB, u.id, 'library', { order: 'title', page: 1, q: 'phụng' })).rows).toHaveLength(1);
    expect((await listOpdsBooks(env.DB, u.id, 'library', { order: 'title', page: 1, q: 'zzz' })).rows).toHaveLength(0);
  });
});
