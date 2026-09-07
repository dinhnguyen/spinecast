import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createUser } from '../../../test/helpers';
import { deleteCatalog, findCatalog, insertCatalog, listCatalogs, recordCatalogResult, toCatalogDto, updateCatalog } from './opdsCatalogs';

const seed = (userId: string, id: string, name: string, url: string, createdAt: number) =>
  insertCatalog(env.DB, { id, user_id: userId, name, url, username: '', password_enc: '', created_at: createdAt, last_ok_at: null, last_error: null });

describe('opds_catalogs table', () => {
  it('lists a user catalogs oldest first', async () => {
    const user = await createUser(env);
    await seed(user.id, 'cat-b', 'Standard Ebooks', 'https://standardebooks.org/opds', 200);
    await seed(user.id, 'cat-a', 'Calibre', 'https://books.test/opds', 100);
    expect((await listCatalogs(env.DB, user.id)).map((r) => r.id)).toEqual(['cat-a', 'cat-b']);
  });

  it('does not leak catalogs across users', async () => {
    const mine = await createUser(env);
    const other = await createUser(env);
    await seed(other.id, 'cat-other', 'Theirs', 'https://books.test/opds', 100);
    expect(await listCatalogs(env.DB, mine.id)).toEqual([]);
    expect(await findCatalog(env.DB, mine.id, 'cat-other')).toBeNull();
    expect(await updateCatalog(env.DB, mine.id, 'cat-other', { name: 'Stolen', url: 'https://x.test/opds', username: '', password_enc: '' })).toBe(false);
    expect(await deleteCatalog(env.DB, mine.id, 'cat-other')).toBe(false);
    expect((await findCatalog(env.DB, other.id, 'cat-other'))?.name).toBe('Theirs');
  });

  it('records success and failure of the last call', async () => {
    const user = await createUser(env);
    await seed(user.id, 'cat-c', 'Calibre', 'https://books.test/opds', 100);
    await recordCatalogResult(env.DB, 'cat-c', false, 'catalog_auth', 500);
    expect((await findCatalog(env.DB, user.id, 'cat-c'))?.last_error).toBe('catalog_auth');
    await recordCatalogResult(env.DB, 'cat-c', true, null, 600);
    const row = await findCatalog(env.DB, user.id, 'cat-c');
    expect(row?.last_ok_at).toBe(600);
    expect(row?.last_error).toBeNull();
  });

  it('never exposes the encrypted password in the dto', async () => {
    const user = await createUser(env);
    await insertCatalog(env.DB, { id: 'cat-d', user_id: user.id, name: 'Calibre', url: 'https://books.test/opds', username: 'me', password_enc: 'sealed.blob', created_at: 100, last_ok_at: null, last_error: null });
    const dto = toCatalogDto((await findCatalog(env.DB, user.id, 'cat-d'))!);
    expect(dto).toEqual({ id: 'cat-d', name: 'Calibre', url: 'https://books.test/opds', username: 'me', hasCredentials: true, createdAt: 100, lastOkAt: null, lastError: null });
    expect(JSON.stringify(dto)).not.toContain('sealed.blob');
  });
});
