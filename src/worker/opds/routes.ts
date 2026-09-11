import { Hono, type Context } from 'hono';
import type { BookRow } from '../db/books';
import { findOpdsBook, listOpdsAuthors, listOpdsBooks, OPDS_PAGE_SIZE, type OpdsListOptions } from '../db/opdsBooks';
import { opdsAuth, type OpdsEnv } from './auth';
import { ACQ_TYPE, acquisitionFeed, NAV_TYPE, navigationFeed, OPENSEARCH_TYPE, openSearchDescription, type BookEntry } from './feed';

export const opdsRoutes = new Hono<OpdsEnv>();
opdsRoutes.use('*', opdsAuth);
// Keep /opds/* responses plain text even on an unhandled error (D1/R2 failure, bug, etc.) -
// the app-level onError returns JSON, which would violate the plain-text contract of this catalog.
opdsRoutes.onError((err, c) => {
  console.error(err);
  return c.text('Internal error', 500);
});

type Ctx = Context<OpdsEnv>;

const coverType = (key: string | null): string | null => {
  if (!key) return null;
  const ext = key.slice(key.lastIndexOf('.') + 1);
  return ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
};

// Absolute catalog root for the current user and scope, no trailing slash.
const baseUrl = (c: Ctx): string => `${new URL(c.req.url).origin}${c.var.opdsBase}`;

export const bookEntry = (base: string, row: BookRow): BookEntry => ({
  id: `urn:spinecast:book:${row.id}`,
  title: row.title,
  author: row.author,
  updated: row.created_at,
  epubHref: `${base}/books/${row.id}.epub`,
  coverHref: row.cover_r2_key ? `${base}/books/${row.id}/cover` : null,
  coverType: coverType(row.cover_r2_key),
});

const pageOf = (raw: string | undefined): number => {
  const n = Number(raw ?? '1');
  return Number.isInteger(n) && n >= 1 ? n : 1;
};

const withPage = (url: string, page: number): string => {
  const u = new URL(url);
  u.searchParams.set('page', String(page));
  return u.toString();
};

const scopeTitle = (scope: string): string => (scope === 'public' ? 'Shared Library' : 'Library');

// opts === null renders an empty feed (used for a blank search).
const sendAcquisition = async (c: Ctx, title: string, opts: Omit<OpdsListOptions, 'page'> | null): Promise<Response> => {
  const page = pageOf(c.req.query('page'));
  const base = baseUrl(c);
  const { rows, hasMore } = opts
    ? await listOpdsBooks(c.env.DB, c.var.opdsUser, c.var.opdsScope, { ...opts, page })
    : { rows: [], hasMore: false };
  const xml = acquisitionFeed({
    id: `urn:spinecast:${c.var.opdsUser}:${c.var.opdsScope}:${c.req.path}`,
    title,
    self: withPage(c.req.url, page),
    start: base,
    updated: Math.floor(Date.now() / 1000),
    next: hasMore ? withPage(c.req.url, page + 1) : null,
    entries: rows.map((r) => bookEntry(base, r)),
  });
  return c.body(xml, 200, { 'content-type': ACQ_TYPE });
};

opdsRoutes.get('/', async (c) => {
  const base = baseUrl(c);
  const first = await listOpdsBooks(c.env.DB, c.var.opdsUser, c.var.opdsScope, { order: 'title', page: 1 });
  const total = first.hasMore ? `${OPDS_PAGE_SIZE}+` : String(first.rows.length);
  const xml = navigationFeed({
    id: `urn:spinecast:${c.var.opdsUser}:${c.var.opdsScope}`,
    title: `Spinecast - ${scopeTitle(c.var.opdsScope)}`,
    self: base,
    start: base,
    updated: Math.floor(Date.now() / 1000),
    searchHref: `${base}/opensearch.xml`,
    entries: [
      { id: `${base}/all`, title: 'All Books', href: `${base}/all`, content: `${total} books` },
      { id: `${base}/recent`, title: 'Recently Added', href: `${base}/recent`, content: 'Sorted by date added' },
      { id: `${base}/authors`, title: 'By Author', href: `${base}/authors`, content: 'Browse by author' },
    ],
  });
  return c.body(xml, 200, { 'content-type': NAV_TYPE });
});

opdsRoutes.get('/all', (c) => sendAcquisition(c, 'All Books', { order: 'title' }));
opdsRoutes.get('/recent', (c) => sendAcquisition(c, 'Recently Added', { order: 'recent' }));

opdsRoutes.get('/authors', async (c) => {
  const base = baseUrl(c);
  const authors = await listOpdsAuthors(c.env.DB, c.var.opdsUser, c.var.opdsScope);
  const xml = navigationFeed({
    id: `${base}/authors`,
    title: 'By Author',
    self: `${base}/authors`,
    start: base,
    updated: Math.floor(Date.now() / 1000),
    searchHref: `${base}/opensearch.xml`,
    entries: authors.map((a) => ({
      id: `${base}/authors/books?author=${encodeURIComponent(a.author)}`,
      title: a.author || 'Unknown Author',
      href: `${base}/authors/books?author=${encodeURIComponent(a.author)}`,
      content: `${a.count} books`,
    })),
  });
  return c.body(xml, 200, { 'content-type': NAV_TYPE });
});

opdsRoutes.get('/authors/books', (c) => {
  const author = c.req.query('author') ?? '';
  return sendAcquisition(c, author || 'Unknown Author', { order: 'title', author });
});

opdsRoutes.get('/search', (c) => {
  const q = (c.req.query('q') ?? '').trim();
  return q ? sendAcquisition(c, `Search: ${q}`, { order: 'title', q }) : sendAcquisition(c, 'Search', null);
});

opdsRoutes.get('/opensearch.xml', (c) =>
  c.body(openSearchDescription(`${baseUrl(c)}/search?q={searchTerms}`), 200, { 'content-type': OPENSEARCH_TYPE }),
);

const streamObject = async (bucket: R2Bucket, key: string, fallbackType: string, extra: Record<string, string> = {}): Promise<Response> => {
  const obj = await bucket.get(key);
  if (!obj) return new Response('Not found', { status: 404 });
  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  if (!headers.get('content-type')) headers.set('content-type', fallbackType);
  headers.set('cache-control', 'private, max-age=3600');
  headers.set('etag', obj.httpEtag);
  for (const [k, v] of Object.entries(extra)) headers.set(k, v);
  return new Response(obj.body, { headers });
};

// RFC 6266: an ASCII-only quoted fallback plus a UTF-8 filename* extension (RFC 5987),
// so a diacritic-bearing title downloads correctly without ever handing Headers.set() a
// value it can't represent as a ByteString (anything above U+00FF throws there).
const stripControlChars = (name: string): string => name.replace(/["\\\r\n]/g, '');

// Transliterate Vietnamese diacritics into plain ASCII instead of just dropping the
// letters, so a niche client that ignores filename* and falls back to this quoted name
// still gets something legible (KOReader is exactly that kind of client).
const asciiFallback = (name: string): string => {
  const withoutMarks = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  // U+0111/U+0110 (d with stroke, lower/upper) are their own letters, not base + combining mark, so NFD leaves them alone.
  const withoutDStroke = withoutMarks.replace(/\u0111/g, 'd').replace(/\u0110/g, 'D');
  const asciiOnly = withoutDStroke.replace(/[^\x20-\x7e]/g, '');
  const hyphenated = asciiOnly.replace(/ /g, '-').replace(/-+/g, '-');
  return hyphenated.replace(/^-+/, '').replace(/-+(\.[^.]*)?$/, (_, ext: string | undefined) => ext ?? '');
};

// encodeURIComponent leaves ! ' ( ) * unescaped, but RFC 5987's attr-char excludes them; escape those too.
const encodeExtValue = (name: string): string =>
  encodeURIComponent(name).replace(/['()*!]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);

const contentDisposition = (filename: string): string => {
  const safe = stripControlChars(filename);
  return `attachment; filename="${asciiFallback(safe)}"; filename*=UTF-8''${encodeExtValue(safe)}`;
};

opdsRoutes.get('/books/:file', async (c) => {
  const file = c.req.param('file');
  if (!file.endsWith('.epub')) return c.text('Not found', 404);
  const book = await findOpdsBook(c.env.DB, c.var.opdsUser, c.var.opdsScope, file.slice(0, -'.epub'.length));
  if (!book) return c.text('Not found', 404);
  return streamObject(c.env.BOOKS, book.r2_key, 'application/epub+zip', {
    'content-disposition': contentDisposition(book.filename),
  });
});

opdsRoutes.get('/books/:bookId/cover', async (c) => {
  const book = await findOpdsBook(c.env.DB, c.var.opdsUser, c.var.opdsScope, c.req.param('bookId'));
  if (!book || !book.cover_r2_key) return c.text('Not found', 404);
  return streamObject(c.env.BOOKS, book.cover_r2_key, 'image/jpeg');
});

opdsRoutes.all('*', (c) => c.text('Not found', 404));
