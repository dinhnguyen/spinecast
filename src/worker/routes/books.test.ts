import { env } from 'cloudflare:workers';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { app } from '../app';
import { createUserAndLogin, firstDeviceId, fixtureEpub, jsonRequest, uploadFixture } from '../../../test/helpers';
import { findBook, insertBook } from '../db/books';
import type { BookDto } from '../../shared/apiTypes';

// Variant of test/fixtures/makeMinimalEpub.ts with an SVG cover, to test that SVG covers are rejected.
const buildEpubWithSvgCover = (): Uint8Array => {
  const container = `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`;
  const opf = `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:uuid:2</dc:identifier><dc:title>Svg Cover Book</dc:title><dc:creator>Test Author</dc:creator><dc:language>en</dc:language><meta name="cover" content="cover-img"/></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/><item id="cover-img" href="cover.svg" media-type="image/svg+xml" properties="cover-image"/></manifest><spine><itemref idref="c1"/></spine></package>`;
  const nav = `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>nav</title></head><body><nav epub:type="toc"><ol><li><a href="c1.xhtml">Chapter 1</a></li></ol></nav></body></html>`;
  const chapter = `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter 1</title></head><body><h1>Chapter 1</h1><p>Text.</p></body></html>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>`;

  return zipSync(
    {
      mimetype: [strToU8('application/epub+zip'), { level: 0 }],
      'META-INF/container.xml': strToU8(container),
      'OEBPS/content.opf': strToU8(opf),
      'OEBPS/nav.xhtml': strToU8(nav),
      'OEBPS/c1.xhtml': strToU8(chapter),
      'OEBPS/cover.svg': strToU8(svg),
    },
    { level: 6 },
  );
};

// Tests in this file share one D1/R2 instance with no reset between them, so a test that
// checks the R2 object is actually gone (or actually still there) after a delete needs
// content no other test in the file also uploads - fixtureEpub() and buildEpubWithSvgCover()
// above are reused by several other tests here and never cleaned up, so they'd inflate the
// blob's reference count. This builds a one-off epub with a random identifier instead.
const buildUniqueEpub = (): Uint8Array => {
  const container = `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`;
  const opf = `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:uuid:${crypto.randomUUID()}</dc:identifier><dc:title>Unique Book</dc:title><dc:creator>Test Author</dc:creator><dc:language>en</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>`;
  const nav = `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>nav</title></head><body><nav epub:type="toc"><ol><li><a href="c1.xhtml">Chapter 1</a></li></ol></nav></body></html>`;
  const chapter = `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter 1</title></head><body><h1>Chapter 1</h1><p>Text.</p></body></html>`;

  return zipSync(
    {
      mimetype: [strToU8('application/epub+zip'), { level: 0 }],
      'META-INF/container.xml': strToU8(container),
      'OEBPS/content.opf': strToU8(opf),
      'OEBPS/nav.xhtml': strToU8(nav),
      'OEBPS/c1.xhtml': strToU8(chapter),
    },
    { level: 6 },
  );
};

const uploadUniqueFixture = async (cookie: string, filename: string, bytes: Uint8Array): Promise<BookDto> => {
  const form = new FormData();
  form.set('file', new File([bytes], filename));
  const res = await app.request('/api/books/upload', { method: 'POST', body: form, headers: { cookie } }, env);
  if (res.status !== 201) throw new Error(`upload failed ${res.status} ${await res.text()}`);
  return res.json();
};

describe('books', () => {
  it('uploads an epub, stores it in r2 and returns metadata with both hashes', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    const book = await uploadFixture(env, cookie, 'Foundryside - Robert Jackson Bennett.epub');
    expect(book.title).toBe('Minimal Book');
    expect(book.author).toBe('Test Author');
    expect(book.hasCover).toBe(true);
    expect(book.hashFilename).toBe('25f8abb4f4f5594f02f361726814fea1');
    expect(book.hashPartial).toMatch(/^[0-9a-f]{32}$/);
    expect(book.progress).toBeNull();
    const list = await app.request(...jsonRequest('/api/books', 'GET', undefined, cookie), env);
    expect((await list.json()).items).toHaveLength(1);
    await app.request(...jsonRequest(`/api/books/${book.id}/progress`, 'PUT', { pctQ: 1, spine: 0 }, cookie), env);
    const listAfterProgress = await app.request(...jsonRequest('/api/books', 'GET', undefined, cookie), env);
    const itemAfterProgress = (await listAfterProgress.json()).items[0];
    expect(itemAfterProgress.progress.deviceId).toBe(await firstDeviceId(env, user.id));
    const file = await app.request(...jsonRequest(`/api/books/${book.id}/file`, 'GET', undefined, cookie), env);
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toBe('application/epub+zip');
    expect(new Uint8Array(await file.arrayBuffer()).length).toBe(fixtureEpub().length);
    const cover = await app.request(...jsonRequest(`/api/books/${book.id}/cover`, 'GET', undefined, cookie), env);
    expect(cover.status).toBe(200);
    expect(cover.headers.get('content-type')).toBe('image/png');
  });

  it('rejects duplicates with 409 and the existing id', async () => {
    const { cookie } = await createUserAndLogin(env);
    const first = await uploadFixture(env, cookie);
    const form = new FormData();
    form.set('file', new File([fixtureEpub()], 'renamed.epub'));
    const res = await app.request('/api/books/upload', { method: 'POST', body: form, headers: { cookie } }, env);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe('duplicate');
    expect(body.error.bookId).toBe(first.id);
  });

  it('rejects non-epub files and wrong extensions', async () => {
    const { cookie } = await createUserAndLogin(env);
    const bad = new FormData();
    bad.set('file', new File([new TextEncoder().encode('nope')], 'x.epub'));
    const r1 = await app.request('/api/books/upload', { method: 'POST', body: bad, headers: { cookie } }, env);
    expect(r1.status).toBe(400);
    expect((await r1.json()).error.code).toBe('not_epub');
    const ext = new FormData();
    ext.set('file', new File([fixtureEpub()], 'book.pdf'));
    const r2 = await app.request('/api/books/upload', { method: 'POST', body: ext, headers: { cookie } }, env);
    expect(r2.status).toBe(400);
  });

  it('rejects svg covers, storing the book without a cover', async () => {
    const { cookie } = await createUserAndLogin(env);
    const form = new FormData();
    form.set('file', new File([buildEpubWithSvgCover()], 'svg-cover.epub'));
    const res = await app.request('/api/books/upload', { method: 'POST', body: form, headers: { cookie } }, env);
    expect(res.status).toBe(201);
    const book = await res.json();
    expect(book.hasCover).toBe(false);
    const cover = await app.request(...jsonRequest(`/api/books/${book.id}/cover`, 'GET', undefined, cookie), env);
    expect(cover.status).toBe(404);
  });

  it('isolates books per user and deletes r2 objects', async () => {
    const a = await createUserAndLogin(env);
    const b = await createUserAndLogin(env);
    const book = await uploadUniqueFixture(a.cookie, 'unique.epub', buildUniqueEpub());
    const other = await app.request(...jsonRequest(`/api/books/${book.id}`, 'GET', undefined, b.cookie), env);
    expect(other.status).toBe(404);
    const row = (await findBook(env.DB, a.user.id, book.id))!;
    expect(await env.BOOKS.head(row.r2_key)).not.toBeNull();
    const del = await app.request(...jsonRequest(`/api/books/${book.id}`, 'DELETE', undefined, a.cookie), env);
    expect(del.status).toBe(204);
    expect(await env.BOOKS.head(row.r2_key)).toBeNull();
    const gone = await app.request(...jsonRequest(`/api/books/${book.id}`, 'GET', undefined, a.cookie), env);
    expect(gone.status).toBe(404);
  });

  it('shares one R2 object across users who import identical bytes', async () => {
    const a = await createUserAndLogin(env);
    const b = await createUserAndLogin(env);
    const bookA = await uploadFixture(env, a.cookie, 'a.epub');
    const bookB = await uploadFixture(env, b.cookie, 'b.epub');
    const rowA = (await findBook(env.DB, a.user.id, bookA.id))!;
    const rowB = (await findBook(env.DB, b.user.id, bookB.id))!;
    expect(rowB.r2_key).toBe(rowA.r2_key);
  });

  it('keeps the shared R2 object until the last referencing book is deleted', async () => {
    const a = await createUserAndLogin(env);
    const b = await createUserAndLogin(env);
    const bytes = buildUniqueEpub();
    const bookA = await uploadUniqueFixture(a.cookie, 'a.epub', bytes);
    const bookB = await uploadUniqueFixture(b.cookie, 'b.epub', bytes);
    const key = (await findBook(env.DB, a.user.id, bookA.id))!.r2_key;

    const delA = await app.request(...jsonRequest(`/api/books/${bookA.id}`, 'DELETE', undefined, a.cookie), env);
    expect(delA.status).toBe(204);
    expect(await env.BOOKS.head(key)).not.toBeNull();

    const delB = await app.request(...jsonRequest(`/api/books/${bookB.id}`, 'DELETE', undefined, b.cookie), env);
    expect(delB.status).toBe(204);
    expect(await env.BOOKS.head(key)).toBeNull();
  });

  it('deletes a legacy row with no blob_hash, unconditionally removing its r2 object', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    const key = `users/${user.id}/books/legacy-key.epub`;
    await env.BOOKS.put(key, new Uint8Array([1, 2, 3]));
    await insertBook(env.DB, {
      id: 'legacy-book',
      user_id: user.id,
      title: 'Legacy',
      author: 'Author',
      filename: 'legacy.epub',
      filesize: 3,
      r2_key: key,
      cover_r2_key: null,
      shared: 0,
      hash_partial: 'legacy-partial',
      hash_filename: 'legacy-filename',
      blob_hash: null,
      created_at: 1,
      last_opened_at: null,
      source_catalog_id: null,
      source_entry_id: null,
    });
    const del = await app.request(...jsonRequest('/api/books/legacy-book', 'DELETE', undefined, cookie), env);
    expect(del.status).toBe(204);
    expect(await env.BOOKS.head(key)).toBeNull();
    expect(await findBook(env.DB, user.id, 'legacy-book')).toBeNull();
  });

  it('lists shared=false by default and toggles it with PATCH', async () => {
    const { cookie } = await createUserAndLogin(env);
    const book = await uploadFixture(env, cookie);
    expect(book.shared).toBe(false);
    const on = await app.request(...jsonRequest(`/api/books/${book.id}`, 'PATCH', { shared: true }, cookie), env);
    expect(on.status).toBe(200);
    expect((await on.json()).shared).toBe(true);
    const list = await app.request(...jsonRequest('/api/books', 'GET', undefined, cookie), env);
    expect((await list.json()).items[0].shared).toBe(true);
    const off = await app.request(...jsonRequest(`/api/books/${book.id}`, 'PATCH', { shared: false }, cookie), env);
    expect((await off.json()).shared).toBe(false);
  });

  it('rejects PATCH from a non-owner and invalid bodies', async () => {
    const a = await createUserAndLogin(env);
    const b = await createUserAndLogin(env);
    const book = await uploadFixture(env, a.cookie);
    const other = await app.request(...jsonRequest(`/api/books/${book.id}`, 'PATCH', { shared: true }, b.cookie), env);
    expect(other.status).toBe(404);
    const bad = await app.request(...jsonRequest(`/api/books/${book.id}`, 'PATCH', { shared: 'yes' }, a.cookie), env);
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe('validation');
  });

  // uploadFixture always zips the same bytes, so a second upload for the same user
  // 409s as a duplicate (dedup is by content hash, not filename) - the svg-cover
  // fixture above gives distinct content to stand in as a second owned book.
  const uploadSecondFixture = async (env: Parameters<typeof uploadFixture>[0], cookie: string) => {
    const form = new FormData();
    form.set('file', new File([buildEpubWithSvgCover()], 'second.epub'));
    const res = await app.request('/api/books/upload', { method: 'POST', body: form, headers: { cookie } }, env);
    if (res.status !== 201) throw new Error(`upload failed ${res.status} ${await res.text()}`);
    return res.json() as Promise<{ id: string; shared: boolean }>;
  };

  it('bulk-deletes only the caller\'s own books, ignoring unknown and other-user ids, and cleans up r2', async () => {
    const a = await createUserAndLogin(env);
    const b = await createUserAndLogin(env);
    // a1 needs content nobody else in this test uploads, or deleting it would leave a
    // shared blob's reference count non-zero and the head() check below would fail.
    const a1 = await uploadUniqueFixture(a.cookie, 'A1.epub', buildUniqueEpub());
    const a2 = await uploadSecondFixture(env, a.cookie);
    const b1 = await uploadFixture(env, b.cookie, 'B1.epub');
    const a1Row = (await findBook(env.DB, a.user.id, a1.id))!;

    const res = await app.request(...jsonRequest('/api/books/bulk-delete', 'POST', { ids: [a1.id, b1.id, 'unknown-id'] }, a.cookie), env);
    expect(res.status).toBe(200);
    expect((await res.json()).deleted).toEqual([a1.id]);
    expect(await env.BOOKS.head(a1Row.r2_key)).toBeNull();

    const listA = await app.request(...jsonRequest('/api/books', 'GET', undefined, a.cookie), env);
    expect((await listA.json()).items.map((x: { id: string }) => x.id)).toEqual([a2.id]);
    const listB = await app.request(...jsonRequest('/api/books', 'GET', undefined, b.cookie), env);
    expect((await listB.json()).items).toHaveLength(1);
  });

  it('keeps a shared R2 object until bulk-delete removes the last book referencing it', async () => {
    const a = await createUserAndLogin(env);
    const b = await createUserAndLogin(env);
    const bytes = buildUniqueEpub();
    const bookA = await uploadUniqueFixture(a.cookie, 'a.epub', bytes);
    const bookB = await uploadUniqueFixture(b.cookie, 'b.epub', bytes);
    const key = (await findBook(env.DB, a.user.id, bookA.id))!.r2_key;

    const delA = await app.request(...jsonRequest('/api/books/bulk-delete', 'POST', { ids: [bookA.id] }, a.cookie), env);
    expect((await delA.json()).deleted).toEqual([bookA.id]);
    expect(await env.BOOKS.head(key)).not.toBeNull();

    const delB = await app.request(...jsonRequest('/api/books/bulk-delete', 'POST', { ids: [bookB.id] }, b.cookie), env);
    expect((await delB.json()).deleted).toEqual([bookB.id]);
    expect(await env.BOOKS.head(key)).toBeNull();
  });

  it('rejects bulk-delete with a non-array or empty ids body', async () => {
    const { cookie } = await createUserAndLogin(env);
    const notArray = await app.request(...jsonRequest('/api/books/bulk-delete', 'POST', { ids: 'nope' }, cookie), env);
    expect(notArray.status).toBe(400);
    const empty = await app.request(...jsonRequest('/api/books/bulk-delete', 'POST', { ids: [] }, cookie), env);
    expect(empty.status).toBe(400);
  });

  it('bulk-shares only the caller\'s own books and returns the updated dtos', async () => {
    const a = await createUserAndLogin(env);
    const b = await createUserAndLogin(env);
    const a1 = await uploadFixture(env, a.cookie, 'A1.epub');
    const a2 = await uploadSecondFixture(env, a.cookie);
    const b1 = await uploadFixture(env, b.cookie, 'B1.epub');

    const res = await app.request(...jsonRequest('/api/books/bulk-share', 'PATCH', { ids: [a1.id, a2.id, b1.id], shared: true }, a.cookie), env);
    expect(res.status).toBe(200);
    const items = (await res.json()).items as { id: string; shared: boolean }[];
    expect(items.map((x) => x.id).sort()).toEqual([a1.id, a2.id].sort());
    expect(items.every((x) => x.shared)).toBe(true);

    const listB = await app.request(...jsonRequest('/api/books', 'GET', undefined, b.cookie), env);
    expect((await listB.json()).items[0].shared).toBe(false);
  });

  it('rejects bulk-share with invalid bodies', async () => {
    const { cookie } = await createUserAndLogin(env);
    const book = await uploadFixture(env, cookie);
    const badShared = await app.request(...jsonRequest('/api/books/bulk-share', 'PATCH', { ids: [book.id], shared: 'yes' }, cookie), env);
    expect(badShared.status).toBe(400);
    const badIds = await app.request(...jsonRequest('/api/books/bulk-share', 'PATCH', { ids: [], shared: true }, cookie), env);
    expect(badIds.status).toBe(400);
  });
});
