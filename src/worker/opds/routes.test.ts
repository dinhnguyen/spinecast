import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { app } from '../app';
import { basicAuth, createOpdsToken, createUserAndLogin, jsonRequest, uploadFixture } from '../../../test/helpers';
import { ACQ_TYPE, NAV_TYPE, OPENSEARCH_TYPE } from './feed';

const setup = async () => {
  const { user, cookie } = await createUserAndLogin(env);
  const book = await uploadFixture(env, cookie, 'Minimal Book.epub');
  const token = await createOpdsToken(env, user.id, 'library');
  const pubToken = await createOpdsToken(env, user.id, 'public');
  const base = `http://localhost/opds/${user.id}`;
  const get = (path: string, t = token) => app.request(`${base}/${path}`, { headers: basicAuth(t) }, env);
  return { user, cookie, book, token, pubToken, base, get };
};

describe('opds catalog routes', () => {
  it('serves the navigation root with three sections and a search link', async () => {
    const { get, base } = await setup();
    const res = await get('library');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe(NAV_TYPE);
    const xml = await res.text();
    expect(xml).toContain(`href="${base}/library/all"`);
    expect(xml).toContain(`href="${base}/library/recent"`);
    expect(xml).toContain(`href="${base}/library/authors"`);
    expect(xml).toContain(`rel="search" href="${base}/library/opensearch.xml"`);
    expect(xml).toContain('<title>All Books</title>');
    expect(xml).toContain('<content type="text">1 books</content>');
  });

  it('lists books with absolute acquisition and cover links', async () => {
    const { get, base, book } = await setup();
    const res = await get('library/all');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe(ACQ_TYPE);
    const xml = await res.text();
    expect(xml).toContain('<title>Minimal Book</title>');
    expect(xml).toContain(`href="${base}/library/books/${book.id}.epub" type="application/epub+zip"`);
    expect(xml).toContain(`href="${base}/library/books/${book.id}/cover" type="image/png"`);
    expect(xml).not.toContain('rel="next"');
    const recent = await get('library/recent');
    expect(recent.status).toBe(200);
    expect(await recent.text()).toContain('<title>Minimal Book</title>');
  });

  it('lists authors and filters by author', async () => {
    const { get, base } = await setup();
    const authors = await get('library/authors');
    expect(authors.headers.get('content-type')).toBe(NAV_TYPE);
    const xml = await authors.text();
    expect(xml).toContain('<title>Test Author</title>');
    expect(xml).toContain(`href="${base}/library/authors/books?author=Test%20Author"`);
    const byAuthor = await get('library/authors/books?author=Test%20Author');
    expect(await byAuthor.text()).toContain('<title>Minimal Book</title>');
    const nobody = await get('library/authors/books?author=Nobody');
    expect(await nobody.text()).not.toContain('<entry>');
  });

  it('searches and serves the opensearch document', async () => {
    const { get, base } = await setup();
    const os = await get('library/opensearch.xml');
    expect(os.headers.get('content-type')).toBe(OPENSEARCH_TYPE);
    expect(await os.text()).toContain(`template="${base}/library/search?q={searchTerms}"`);
    expect(await (await get('library/search?q=minimal')).text()).toContain('<title>Minimal Book</title>');
    expect(await (await get('library/search?q=')).text()).not.toContain('<entry>');
    expect(await (await get('library/search')).text()).not.toContain('<entry>');
  });

  it('public scope hides unshared books until shared', async () => {
    const { get, pubToken, book, cookie } = await setup();
    expect(await (await get('public/all', pubToken)).text()).not.toContain('<entry>');
    expect(await (await get('public', pubToken)).text()).toContain('<content type="text">0 books</content>');
    await app.request(...jsonRequest(`/api/books/${book.id}`, 'PATCH', { shared: true }, cookie), env);
    expect(await (await get('public/all', pubToken)).text()).toContain('<title>Minimal Book</title>');
  });

  it('does not leak books across users and requires auth on every route', async () => {
    // Distinct cf-connecting-ip: every failing-auth request below shares one rate-limit
    // bucket keyed by IP, and that bucket is never reset between it() blocks in this file.
    const ip = { 'cf-connecting-ip': '198.51.100.7' };
    const a = await setup();
    const b = await setup();
    const cross = await app.request(`${b.base}/library/all`, { headers: { ...basicAuth(a.token), ...ip } }, env);
    expect(cross.status).toBe(401);
    for (const p of ['', '/all', '/recent', '/authors', '/authors/books?author=x', '/search?q=a', '/opensearch.xml']) {
      const res = await app.request(`${a.base}/library${p}`, { headers: ip }, env);
      expect(res.status, p).toBe(401);
      expect(res.headers.get('www-authenticate')).toBe('Basic realm="Spinecast"');
    }
    expect((await app.request(`${a.base}/nope/all`, { headers: { ...basicAuth(a.token), ...ip } }, env)).status).toBe(404);
  });

  it('returns a plain-text 404 for an unmatched sub-path under a valid, authenticated scope', async () => {
    const { get } = await setup();
    const res = await get('library/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.headers.get('content-type')).not.toBe('application/json');
    expect(await res.text()).toBe('Not found');
  });

  it('requires auth before the catch-all on an unmatched sub-path with bad credentials', async () => {
    const { base } = await setup();
    const ip = { 'cf-connecting-ip': '198.51.100.42' };
    const res = await app.request(`${base}/library/does-not-exist`, { headers: ip }, env);
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toBe('Basic realm="Spinecast"');
  });

  it('streams the epub with the original filename and the cover', async () => {
    const { get, book } = await setup();
    const file = await get(`library/books/${book.id}.epub`);
    expect(file.status).toBe(200);
    expect(file.headers.get('content-type')).toBe('application/epub+zip');
    expect(file.headers.get('content-disposition')).toBe(
      `attachment; filename="Minimal-Book.epub"; filename*=UTF-8''Minimal%20Book.epub`,
    );
    expect(file.headers.get('cache-control')).toBe('private, max-age=3600');
    expect((await file.arrayBuffer()).byteLength).toBe(book.filesize);
    const cover = await get(`library/books/${book.id}/cover`);
    expect(cover.status).toBe(200);
    expect(cover.headers.get('content-type')).toBe('image/png');
  });

  it('streams a book with a non-ascii filename via a correctly encoded rfc 6266 header', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    const filename = 'Truyện Kiều.epub';
    const book = await uploadFixture(env, cookie, filename);
    const token = await createOpdsToken(env, user.id, 'library');
    const res = await app.request(
      `http://localhost/opds/${user.id}/library/books/${book.id}.epub`,
      { headers: basicAuth(token) },
      env,
    );
    expect(res.status).toBe(200);
    expect((await res.arrayBuffer()).byteLength).toBe(book.filesize);
    expect(res.headers.get('content-disposition')).toBe(
      `attachment; filename="Truyen-Kieu.epub"; filename*=UTF-8''Truy%E1%BB%87n%20Ki%E1%BB%81u.epub`,
    );
  });

  it('transliterates vietnamese diacritics in the ascii fallback filename', async () => {
    // Each case gets its own user: the fixture bytes are identical across filenames, and
    // upload dedupes by content hash per user, so reusing one user would 409 on the second case.
    const cases: [string, string][] = [
      ['Số đỏ.epub', 'So-do.epub'],
      ['Tắt đèn.epub', 'Tat-den.epub'],
      ['Đoạn tuyệt.epub', 'Doan-tuyet.epub'],
      ['Hai đứa trẻ.epub', 'Hai-dua-tre.epub'],
    ];
    for (const [filename, expectedAscii] of cases) {
      const { user, cookie } = await createUserAndLogin(env);
      const token = await createOpdsToken(env, user.id, 'library');
      const book = await uploadFixture(env, cookie, filename);
      const res = await app.request(
        `http://localhost/opds/${user.id}/library/books/${book.id}.epub`,
        { headers: basicAuth(token) },
        env,
      );
      expect(res.status, filename).toBe(200);
      expect(res.headers.get('content-disposition'), filename).toContain(`filename="${expectedAscii}"`);
    }
  });

  it('returns plain text, not json, when an unhandled error occurs mid-request', async () => {
    const { get } = await setup();
    const original = env.DB.prepare;
    // Force a D1 failure mid-request to prove /opds/* keeps its plain-text contract on unhandled errors.
    env.DB.prepare = () => {
      throw new Error('boom');
    };
    try {
      const res = await get('library/all');
      expect(res.status).toBe(500);
      expect(res.headers.get('content-type')).not.toBe('application/json');
      expect(await res.text()).toBe('Internal error');
    } finally {
      env.DB.prepare = original;
    }
  });

  it('hides unshared files from the public scope and other users', async () => {
    const a = await setup();
    const b = await setup();
    expect((await a.get(`public/books/${a.book.id}.epub`, a.pubToken)).status).toBe(404);
    expect((await a.get(`public/books/${a.book.id}/cover`, a.pubToken)).status).toBe(404);
    await app.request(...jsonRequest(`/api/books/${a.book.id}`, 'PATCH', { shared: true }, a.cookie), env);
    expect((await a.get(`public/books/${a.book.id}.epub`, a.pubToken)).status).toBe(200);
    expect((await b.get(`library/books/${a.book.id}.epub`)).status).toBe(404);
    expect((await a.get(`library/books/${a.book.id}.epub`, b.token)).status).toBe(401);
  });
});
