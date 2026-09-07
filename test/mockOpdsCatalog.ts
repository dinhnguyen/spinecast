import { Hono } from 'hono';
import { CALIBRE_ACQUISITION, OPENSEARCH_DESCRIPTOR } from './fixtures/opdsFeeds';
import { buildMinimalEpub } from './fixtures/makeMinimalEpub';

export const createMockOpdsCatalog = (opts: { username?: string; password?: string } = {}) => {
  const app = new Hono();
  const calls: string[] = [];
  let redirectTo: string | null = null;

  // A password with no username is a real configuration - it is what Spinecast's
  // own feed wants - so auth is required whenever either half is set.
  const authed = (header: string | undefined): boolean => {
    if (!opts.username && !opts.password) return true;
    return header === `Basic ${btoa(`${opts.username ?? ''}:${opts.password ?? ''}`)}`;
  };

  app.use('*', async (c, next) => {
    calls.push(new URL(c.req.url).pathname + (new URL(c.req.url).search || ''));
    if (!authed(c.req.header('authorization'))) return c.text('nope', 401);
    await next();
  });

  app.get('/opds', (c) => c.body(CALIBRE_ACQUISITION, 200, { 'content-type': 'application/atom+xml;profile=opds-catalog;kind=acquisition' }));
  app.get('/opds-caps', (c) => c.body(CALIBRE_ACQUISITION, 200, { 'content-type': 'Application/Atom+XML' }));
  app.get('/opds/opensearch.xml', (c) => c.body(OPENSEARCH_DESCRIPTOR, 200, { 'content-type': 'application/opensearchdescription+xml' }));
  app.get('/get/EPUB/:n', (c) => c.body(buildMinimalEpub() as Uint8Array<ArrayBuffer>, 200, { 'content-type': 'application/epub+zip', 'content-disposition': 'attachment; filename="Remote Book.epub"' }));
  app.get('/get/EPUB-noctype/:n', (c) => new Response(buildMinimalEpub() as Uint8Array<ArrayBuffer>, { status: 200 }));
  app.get('/get/EPUB-badname/:n', (c) =>
    c.body(buildMinimalEpub() as Uint8Array<ArrayBuffer>, 200, { 'content-type': 'application/epub+zip', 'content-disposition': `attachment; filename*=UTF-8''%zz; filename="fallback.epub"` }),
  );
  app.get('/get/thumb/:n', (c) => c.body(new Uint8Array([137, 80, 78, 71]), 200, { 'content-type': 'image/png' }));
  app.get('/get/thumb-caps/:n', (c) => c.body(new Uint8Array([137, 80, 78, 71]), 200, { 'content-type': 'IMAGE/PNG' }));
  app.get('/get/svg/:n', (c) => c.body('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 200, { 'content-type': 'image/svg+xml' }));
  app.get('/get/svg-caps/:n', (c) => c.body('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>', 200, { 'content-type': 'IMAGE/SVG+XML' }));
  app.get('/html', (c) => c.html('<html><body>hi</body></html>'));
  app.get('/hop', (c) => c.redirect(redirectTo ?? '/opds', 302));
  app.get('/boom', (c) => c.text('server on fire', 500));

  return {
    fetch: ((input: RequestInfo | URL, init?: RequestInit) => app.fetch(new Request(input as string, init))) as typeof fetch,
    calls,
    setRedirect: (to: string | null) => {
      redirectTo = to;
    },
  };
};
