import { env } from 'cloudflare:workers';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { app } from '../app';
import { createUserAndLogin, firstDeviceId, fixtureEpub, jsonRequest, uploadFixture } from '../../../test/helpers';

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
    const book = await uploadFixture(env, a.cookie);
    const other = await app.request(...jsonRequest(`/api/books/${book.id}`, 'GET', undefined, b.cookie), env);
    expect(other.status).toBe(404);
    const del = await app.request(...jsonRequest(`/api/books/${book.id}`, 'DELETE', undefined, a.cookie), env);
    expect(del.status).toBe(204);
    expect(await env.BOOKS.head(`users/${a.user.id}/books/${book.id}.epub`)).toBeNull();
    const gone = await app.request(...jsonRequest(`/api/books/${book.id}`, 'GET', undefined, a.cookie), env);
    expect(gone.status).toBe(404);
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
});
