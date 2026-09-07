import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createUser } from '../../../test/helpers';
import { findBook, insertBook, listSourceEntryIds, setBookSourceIfUnset } from './books';
import { insertCatalog } from './opdsCatalogs';

describe('book provenance', () => {
  it('maps entry ids to book ids for the ones actually imported', async () => {
    const user = await createUser(env);
    await insertCatalog(env.DB, { id: 'cat-a', user_id: user.id, name: 'Calibre', url: 'https://books.test/opds', username: '', password_enc: '', created_at: 1, last_ok_at: null, last_error: null });
    await insertBook(env.DB, { id: 'bk-1', user_id: user.id, title: 'T', author: 'A', filename: 'a.epub', filesize: 10, r2_key: 'k', cover_r2_key: null, shared: 0, hash_partial: 'h1', hash_filename: 'f1', created_at: 1, last_opened_at: null, source_catalog_id: 'cat-a', source_entry_id: 'urn:entry:1' });
    const map = await listSourceEntryIds(env.DB, user.id, 'cat-a', ['urn:entry:1', 'urn:entry:2']);
    expect(map.get('urn:entry:1')).toBe('bk-1');
    expect(map.has('urn:entry:2')).toBe(false);
  });

  it('sets provenance on a book that has none, but never overwrites a source it already has', async () => {
    const user = await createUser(env);
    await insertCatalog(env.DB, { id: 'cat-uploaded', user_id: user.id, name: 'Calibre', url: 'https://books.test/opds', username: '', password_enc: '', created_at: 1, last_ok_at: null, last_error: null });
    await insertBook(env.DB, { id: 'bk-uploaded', user_id: user.id, title: 'T', author: 'A', filename: 'a.epub', filesize: 10, r2_key: 'k', cover_r2_key: null, shared: 0, hash_partial: 'h1', hash_filename: 'f1', created_at: 1, last_opened_at: null, source_catalog_id: null, source_entry_id: null });
    await setBookSourceIfUnset(env.DB, 'bk-uploaded', 'cat-uploaded', 'urn:entry:1');
    expect(await findBook(env.DB, user.id, 'bk-uploaded')).toMatchObject({ source_catalog_id: 'cat-uploaded', source_entry_id: 'urn:entry:1' });

    await setBookSourceIfUnset(env.DB, 'bk-uploaded', 'cat-uploaded', 'urn:entry:2');
    expect(await findBook(env.DB, user.id, 'bk-uploaded')).toMatchObject({ source_catalog_id: 'cat-uploaded', source_entry_id: 'urn:entry:1' });
  });

  it('looks up more than 100 entries in one catalog without hitting D1 bound-parameter limit', async () => {
    const user = await createUser(env);
    await insertCatalog(env.DB, { id: 'cat-big', user_id: user.id, name: 'Big', url: 'https://books.test/opds', username: '', password_enc: '', created_at: 1, last_ok_at: null, last_error: null });
    const entryIds = Array.from({ length: 120 }, (_, i) => `urn:entry:${i}`);
    for (const [i, entryId] of entryIds.entries()) {
      await insertBook(env.DB, {
        id: `bk-big-${i}`,
        user_id: user.id,
        title: 'T',
        author: 'A',
        filename: 'a.epub',
        filesize: 10,
        r2_key: `k${i}`,
        cover_r2_key: null,
        shared: 0,
        hash_partial: `h${i}`,
        hash_filename: `f${i}`,
        created_at: 1,
        last_opened_at: null,
        source_catalog_id: 'cat-big',
        source_entry_id: entryId,
      });
    }
    const map = await listSourceEntryIds(env.DB, user.id, 'cat-big', entryIds);
    expect(map.size).toBe(120);
    for (const entryId of entryIds) expect(map.get(entryId)).toBe(`bk-big-${entryIds.indexOf(entryId)}`);
  });
});
