import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it } from 'vitest';
import { app } from '../app';
import { setCatalogFetchForTests } from '../opdsClient/fetchRemote';
import { createMockOpdsCatalog } from '../../../test/mockOpdsCatalog';
import { buildMinimalEpub } from '../../../test/fixtures/makeMinimalEpub';
import { createUserAndLogin, jsonRequest, uploadFixture } from '../../../test/helpers';
import { findBook } from '../db/books';
import { loadFeed } from './opdsCatalogs';

const CATALOG = { name: 'Calibre nhà', url: 'https://books.test/opds', username: 'me', password: 'pw-not-real' };

afterEach(() => setCatalogFetchForTests(null));

describe('opds catalog crud', () => {
  it('creates a catalog after probing it, and never returns the password', async () => {
    setCatalogFetchForTests(createMockOpdsCatalog({ username: 'me', password: 'pw-not-real' }).fetch);
    const { user, cookie } = await createUserAndLogin(env);
    const res = await app.request(...jsonRequest('/api/opds/catalogs', 'POST', CATALOG, cookie), env);
    expect(res.status).toBe(201);
    const dto = await res.json();
    expect(dto).toMatchObject({ name: 'Calibre nhà', url: 'https://books.test/opds', username: 'me', hasCredentials: true, lastError: null });
    expect(dto.lastOkAt).toBeGreaterThan(0);
    expect(JSON.stringify(dto)).not.toContain('pw-not-real');
    const row = await env.DB.prepare('select password_enc from opds_catalogs where user_id = ?').bind(user.id).first<{ password_enc: string }>();
    expect(row?.password_enc).not.toContain('pw-not-real');

    const list = await (await app.request(...jsonRequest('/api/opds/catalogs', 'GET', undefined, cookie), env)).json();
    expect(list.items).toHaveLength(1);
  });

  it('refuses to create a catalog it cannot reach, and stores nothing', async () => {
    setCatalogFetchForTests(() => Promise.reject(new Error('dns')));
    const { user, cookie } = await createUserAndLogin(env);
    const res = await app.request(...jsonRequest('/api/opds/catalogs', 'POST', CATALOG, cookie), env);
    expect(res.status).toBe(502);
    expect((await res.json()).error.code).toBe('catalog_unreachable');
    expect((await env.DB.prepare('select count(*) as n from opds_catalogs where user_id = ?').bind(user.id).first<{ n: number }>())?.n).toBe(0);
  });

  it('rejects a blocked host, a bad url and a missing name', async () => {
    const { cookie } = await createUserAndLogin(env);
    const blocked = await app.request(...jsonRequest('/api/opds/catalogs', 'POST', { ...CATALOG, url: 'http://10.0.0.5/opds' }, cookie), env);
    expect(blocked.status).toBe(400);
    expect((await blocked.json()).error.code).toBe('blocked_host');
    expect((await app.request(...jsonRequest('/api/opds/catalogs', 'POST', { ...CATALOG, url: 'ftp://books.test' }, cookie), env)).status).toBe(400);
    expect((await app.request(...jsonRequest('/api/opds/catalogs', 'POST', { ...CATALOG, name: '  ' }, cookie), env)).status).toBe(400);
  });

  // app.request resolves a bare path against http://localhost, so a catalog URL on
  // "localhost" is the request's own origin here - the self-origin exception (design 9.1)
  // that lets a user add another Spinecast user's public catalog as a source.
  it('allows a catalog on the request own origin, and still blocks a private ip', async () => {
    setCatalogFetchForTests(createMockOpdsCatalog().fetch);
    const { cookie } = await createUserAndLogin(env);
    const selfOrigin = await app.request(...jsonRequest('/api/opds/catalogs', 'POST', { ...CATALOG, url: 'http://localhost/opds' }, cookie), env);
    expect(selfOrigin.status).toBe(201);
    expect((await selfOrigin.json()).url).toBe('http://localhost/opds');

    const blocked = await app.request(...jsonRequest('/api/opds/catalogs', 'POST', { ...CATALOG, url: 'http://10.0.0.5/opds' }, cookie), env);
    expect(blocked.status).toBe(400);
    expect((await blocked.json()).error.code).toBe('blocked_host');
  });

  it('keeps the stored password when patch omits it and clears it when both fields are empty', async () => {
    setCatalogFetchForTests(createMockOpdsCatalog({ username: 'me', password: 'pw-not-real' }).fetch);
    const { cookie } = await createUserAndLogin(env);
    const created = await (await app.request(...jsonRequest('/api/opds/catalogs', 'POST', CATALOG, cookie), env)).json();

    setCatalogFetchForTests(createMockOpdsCatalog().fetch);
    const renamed = await (await app.request(...jsonRequest(`/api/opds/catalogs/${created.id}`, 'PATCH', { name: 'Calibre cũ' }, cookie), env)).json();
    expect(renamed).toMatchObject({ name: 'Calibre cũ', username: 'me', hasCredentials: true });

    const cleared = await (await app.request(...jsonRequest(`/api/opds/catalogs/${created.id}`, 'PATCH', { username: '', password: '' }, cookie), env)).json();
    expect(cleared).toMatchObject({ username: '', hasCredentials: false });
  });

  it('keeps the stored password when only the password is sent empty and the username is untouched', async () => {
    setCatalogFetchForTests(createMockOpdsCatalog({ username: 'me', password: 'pw-not-real' }).fetch);
    const { cookie } = await createUserAndLogin(env);
    const created = await (await app.request(...jsonRequest('/api/opds/catalogs', 'POST', CATALOG, cookie), env)).json();

    setCatalogFetchForTests(createMockOpdsCatalog().fetch);
    const renamed = await (await app.request(...jsonRequest(`/api/opds/catalogs/${created.id}`, 'PATCH', { name: 'Renamed', password: '' }, cookie), env)).json();
    expect(renamed).toMatchObject({ name: 'Renamed', username: 'me', hasCredentials: true });
  });

  it('scopes every route to the owner and deletes', async () => {
    setCatalogFetchForTests(createMockOpdsCatalog({ username: 'me', password: 'pw-not-real' }).fetch);
    const mine = await createUserAndLogin(env);
    const other = await createUserAndLogin(env);
    const created = await (await app.request(...jsonRequest('/api/opds/catalogs', 'POST', CATALOG, mine.cookie), env)).json();

    expect((await app.request(...jsonRequest(`/api/opds/catalogs/${created.id}`, 'PATCH', { name: 'Stolen' }, other.cookie), env)).status).toBe(404);
    expect((await app.request(...jsonRequest(`/api/opds/catalogs/${created.id}`, 'DELETE', undefined, other.cookie), env)).status).toBe(404);
    expect((await (await app.request(...jsonRequest('/api/opds/catalogs', 'GET', undefined, other.cookie), env)).json()).items).toEqual([]);
    expect((await app.request(...jsonRequest('/api/opds/catalogs', 'GET'), env)).status).toBe(401);

    expect((await app.request(...jsonRequest(`/api/opds/catalogs/${created.id}`, 'DELETE', undefined, mine.cookie), env)).status).toBe(204);
    expect((await (await app.request(...jsonRequest('/api/opds/catalogs', 'GET', undefined, mine.cookie), env)).json()).items).toEqual([]);
  });

  it('does not follow a search descriptor to a different origin, and never requests it', async () => {
    const requested: string[] = [];
    const feedWithForeignDescriptor = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Suspicious Library</title>
  <link rel="search" href="https://evil.example/opensearch.xml" type="application/opensearchdescription+xml"/>
</feed>`;
    setCatalogFetchForTests((async (url: RequestInfo | URL) => {
      const u = new URL(url as string);
      requested.push(u.toString());
      if (u.origin === 'https://books.test') return new Response(feedWithForeignDescriptor, { status: 200, headers: { 'content-type': 'application/atom+xml' } });
      return new Response('must never be fetched', { status: 200, headers: { 'content-type': 'application/opensearchdescription+xml' } });
    }) as typeof fetch);

    const feed = await loadFeed({ url: new URL('https://books.test/opds'), username: '', password: '', selfHostname: 'spinecast.test' });
    expect(feed.searchTemplate).toBeNull();
    expect(requested).toEqual(['https://books.test/opds']);
  });
});

const seedCatalog = async (cookie: string) => {
  setCatalogFetchForTests(createMockOpdsCatalog().fetch);
  return (await (await app.request(...jsonRequest('/api/opds/catalogs', 'POST', { name: 'Calibre', url: 'https://books.test/opds', username: '', password: '' }, cookie), env)).json()) as { id: string };
};

describe('browse', () => {
  it('returns a normalised feed with the search template resolved', async () => {
    const { cookie } = await createUserAndLogin(env);
    const cat = await seedCatalog(cookie);
    const feed = await (await app.request(...jsonRequest(`/api/opds/catalogs/${cat.id}/browse`, 'GET', undefined, cookie), env)).json();
    expect(feed.title).toBe('Calibre Library');
    expect(feed.next).toBe('/opds/all?page=2');
    expect(feed.searchTemplate).toBe('/opds/search?query={searchTerms}');
    expect(feed.entries.map((e: { title: string }) => e.title)).toEqual(['Dune & Sons', 'No Author, No Cover']);
    expect(feed.entries[0].inLibrary).toBeNull();
  });

  it('refuses an href that leaves the catalog origin and a catalog that is not yours', async () => {
    const mine = await createUserAndLogin(env);
    const other = await createUserAndLogin(env);
    const cat = await seedCatalog(mine.cookie);
    const off = await app.request(...jsonRequest(`/api/opds/catalogs/${cat.id}/browse?href=https://evil.test/x`, 'GET', undefined, mine.cookie), env);
    expect(off.status).toBe(400);
    expect((await off.json()).error.code).toBe('validation');
    expect((await app.request(...jsonRequest(`/api/opds/catalogs/${cat.id}/browse`, 'GET', undefined, other.cookie), env)).status).toBe(404);
  });

  it('records the failure on the catalog row when the remote breaks', async () => {
    const { cookie } = await createUserAndLogin(env);
    const cat = await seedCatalog(cookie);
    setCatalogFetchForTests(() => Promise.reject(new Error('dns')));
    expect((await app.request(...jsonRequest(`/api/opds/catalogs/${cat.id}/browse`, 'GET', undefined, cookie), env)).status).toBe(502);
    const listed = await (await app.request(...jsonRequest('/api/opds/catalogs', 'GET', undefined, cookie), env)).json();
    expect(listed.items[0].lastError).toBe('catalog_unreachable');
  });

  it('normalises an acquisition link with no href to a null acquisition', async () => {
    const { cookie } = await createUserAndLogin(env);
    const feedWithHreflessAcquisition = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Broken</title>
  <entry>
    <title>No Href</title>
    <id>urn:uuid:9999</id>
    <link rel="http://opds-spec.org/acquisition" type="application/epub+zip"/>
  </entry>
</feed>`;
    setCatalogFetchForTests((async () => new Response(feedWithHreflessAcquisition, { status: 200, headers: { 'content-type': 'application/atom+xml' } })) as typeof fetch);
    const created = (await (await app.request(...jsonRequest('/api/opds/catalogs', 'POST', { name: 'Broken', url: 'https://books.test/opds', username: '', password: '' }, cookie), env)).json()) as { id: string };
    const feed = await (await app.request(...jsonRequest(`/api/opds/catalogs/${created.id}/browse`, 'GET', undefined, cookie), env)).json();
    expect(feed.entries[0].acquisition).toBeNull();
  });
});

describe('image', () => {
  it('proxies a cover image and rejects a non-image target', async () => {
    const { cookie } = await createUserAndLogin(env);
    const cat = await seedCatalog(cookie);
    const ok = await app.request(...jsonRequest(`/api/opds/catalogs/${cat.id}/image?href=/get/thumb/1`, 'GET', undefined, cookie), env);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('image/png');
    const bad = await app.request(...jsonRequest(`/api/opds/catalogs/${cat.id}/image?href=/get/EPUB/1`, 'GET', undefined, cookie), env);
    expect(bad.status).toBe(502);
    expect((await bad.json()).error.code).toBe('not_opds');
  });

  it('refuses an SVG cover, which could carry script on our own origin', async () => {
    const { cookie } = await createUserAndLogin(env);
    const cat = await seedCatalog(cookie);
    const svg = await app.request(...jsonRequest(`/api/opds/catalogs/${cat.id}/image?href=/get/svg/1`, 'GET', undefined, cookie), env);
    expect(svg.status).toBe(502);
    expect((await svg.json()).error.code).toBe('not_opds');
  });

  it('carries the hardening headers on a permitted raster type', async () => {
    const { cookie } = await createUserAndLogin(env);
    const cat = await seedCatalog(cookie);
    const ok = await app.request(...jsonRequest(`/api/opds/catalogs/${cat.id}/image?href=/get/thumb/1`, 'GET', undefined, cookie), env);
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toBe('image/png');
    expect(ok.headers.get('x-content-type-options')).toBe('nosniff');
    expect(ok.headers.get('content-disposition')).toBe('inline; filename="cover"');
    expect(ok.headers.get('content-security-policy')).toBe("default-src 'none'; img-src 'self' data:; sandbox");
  });
});

describe('import', () => {
  it('downloads the file, stores it with provenance and marks it in a later browse', async () => {
    const { cookie } = await createUserAndLogin(env);
    const cat = await seedCatalog(cookie);
    const res = await app.request(...jsonRequest(`/api/opds/catalogs/${cat.id}/import`, 'POST', { href: '/get/EPUB/1', entryId: 'urn:uuid:1111' }, cookie), env);
    expect(res.status).toBe(201);
    const book = await res.json();
    expect(book.filename).toBe('Remote Book.epub');
    expect(book.hashPartial).toMatch(/^[0-9a-f]{32}$/);

    const feed = await (await app.request(...jsonRequest(`/api/opds/catalogs/${cat.id}/browse`, 'GET', undefined, cookie), env)).json();
    expect(feed.entries[0].inLibrary).toBe(book.id);

    const library = await (await app.request(...jsonRequest('/api/books', 'GET', undefined, cookie), env)).json();
    expect(library.items.map((b: { id: string }) => b.id)).toContain(book.id);
  });

  it('answers 409 with the existing book id on a second import', async () => {
    const { cookie } = await createUserAndLogin(env);
    const cat = await seedCatalog(cookie);
    const first = await (await app.request(...jsonRequest(`/api/opds/catalogs/${cat.id}/import`, 'POST', { href: '/get/EPUB/1', entryId: 'urn:uuid:1111' }, cookie), env)).json();
    const again = await app.request(...jsonRequest(`/api/opds/catalogs/${cat.id}/import`, 'POST', { href: '/get/EPUB/2', entryId: 'urn:uuid:2222' }, cookie), env);
    expect(again.status).toBe(409);
    const body = await again.json();
    expect(body.error.code).toBe('duplicate');
    expect(body.error.bookId).toBe(first.id);
  });

  it('marks provenance on a book that was already in the library with no source, so a later browse reports it in library', async () => {
    const { cookie } = await createUserAndLogin(env);
    const cat = await seedCatalog(cookie);
    const form = new FormData();
    form.set('file', new File([buildMinimalEpub()], 'already-owned.epub'));
    const uploaded = await (await app.request('/api/books/upload', { method: 'POST', body: form, headers: { cookie } }, env)).json();

    const again = await app.request(...jsonRequest(`/api/opds/catalogs/${cat.id}/import`, 'POST', { href: '/get/EPUB/1', entryId: 'urn:uuid:1111' }, cookie), env);
    expect(again.status).toBe(409);
    expect((await again.json()).error.bookId).toBe(uploaded.id);

    const feed = await (await app.request(...jsonRequest(`/api/opds/catalogs/${cat.id}/browse`, 'GET', undefined, cookie), env)).json();
    expect(feed.entries.find((e: { id: string }) => e.id === 'urn:uuid:1111').inLibrary).toBe(uploaded.id);
  });

  it('accepts a download with no content-type header at all', async () => {
    const { cookie } = await createUserAndLogin(env);
    const cat = await seedCatalog(cookie);
    const res = await app.request(...jsonRequest(`/api/opds/catalogs/${cat.id}/import`, 'POST', { href: '/get/EPUB-noctype/1', entryId: 'urn:uuid:1111' }, cookie), env);
    expect(res.status).toBe(201);
  });

  it('rejects an off-origin href, a missing entryId, and a file that is not an epub', async () => {
    const { cookie } = await createUserAndLogin(env);
    const cat = await seedCatalog(cookie);
    expect((await app.request(...jsonRequest(`/api/opds/catalogs/${cat.id}/import`, 'POST', { href: 'https://evil.test/x.epub', entryId: 'e' }, cookie), env)).status).toBe(400);
    expect((await app.request(...jsonRequest(`/api/opds/catalogs/${cat.id}/import`, 'POST', { href: '/get/EPUB/1' }, cookie), env)).status).toBe(400);
    const notEpub = await app.request(...jsonRequest(`/api/opds/catalogs/${cat.id}/import`, 'POST', { href: '/html', entryId: 'e' }, cookie), env);
    expect(notEpub.status).toBe(400);
    expect((await notEpub.json()).error.code).toBe('not_epub');
  });

  it('shares the R2 object when a different user imports the same bytes through a catalog', async () => {
    const a = await createUserAndLogin(env);
    const b = await createUserAndLogin(env);
    const bookA = await uploadFixture(env, a.cookie);
    const cat = await seedCatalog(b.cookie);
    const res = await app.request(...jsonRequest(`/api/opds/catalogs/${cat.id}/import`, 'POST', { href: '/get/EPUB/1', entryId: 'urn:uuid:1111' }, b.cookie), env);
    expect(res.status).toBe(201);
    const bookB = await res.json();
    const rowA = (await findBook(env.DB, a.user.id, bookA.id))!;
    const rowB = (await findBook(env.DB, b.user.id, bookB.id))!;
    expect(rowB.r2_key).toBe(rowA.r2_key);
  });
});
