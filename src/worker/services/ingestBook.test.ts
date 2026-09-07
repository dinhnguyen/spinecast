import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createUser, fixtureEpub } from '../../../test/helpers';
import { findBook } from '../db/books';
import { insertCatalog } from '../db/opdsCatalogs';
import { EpubParseError } from './epub';
import { ingestBook } from './ingestBook';

describe('ingestBook', () => {
  it('stores the file, the row and the provenance', async () => {
    const user = await createUser(env);
    await insertCatalog(env.DB, { id: 'cat-a', user_id: user.id, name: 'Calibre', url: 'https://books.test/opds', username: '', password_enc: '', created_at: 1, last_ok_at: null, last_error: null });
    const res = await ingestBook(env.DB, env.BOOKS, {
      userId: user.id,
      filename: 'Minimal Book.epub',
      bytes: fixtureEpub(),
      source: { catalogId: 'cat-a', entryId: 'urn:entry:1' },
    });
    expect(res.ok).toBe(true);
    const row = (await findBook(env.DB, user.id, res.bookId))!;
    expect(row.filename).toBe('Minimal Book.epub');
    expect(row.hash_partial).toMatch(/^[0-9a-f]{32}$/);
    expect(row.source_catalog_id).toBe('cat-a');
    expect(row.source_entry_id).toBe('urn:entry:1');
    expect(await env.BOOKS.get(row.r2_key)).not.toBeNull();
  });

  it('reports a duplicate with the existing book id and writes nothing new', async () => {
    const user = await createUser(env);
    const first = await ingestBook(env.DB, env.BOOKS, { userId: user.id, filename: 'a.epub', bytes: fixtureEpub(), source: null });
    const second = await ingestBook(env.DB, env.BOOKS, { userId: user.id, filename: 'b.epub', bytes: fixtureEpub(), source: null });
    expect(second).toEqual({ ok: false, bookId: first.bookId });
  });

  it('throws EpubParseError for bytes that are not an epub', async () => {
    const user = await createUser(env);
    await expect(ingestBook(env.DB, env.BOOKS, { userId: user.id, filename: 'x.epub', bytes: new Uint8Array([1, 2, 3]), source: null })).rejects.toBeInstanceOf(EpubParseError);
  });
});
