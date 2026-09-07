import { Hono, type Context } from 'hono';
import type { AppEnv } from '../appEnv';
import { ApiError } from '../errors';
import { deleteCatalog, findCatalog, insertCatalog, listCatalogs, recordCatalogResult, toCatalogDto, updateCatalog, type OpdsCatalogRow } from '../db/opdsCatalogs';
import { findBookWithProgress, listSourceEntryIds, setBookSourceIfUnset } from '../db/books';
import { requireAuth } from '../middleware/requireAuth';
import { decryptString, encryptString, randomHex } from '../services/crypto';
import { EpubParseError } from '../services/epub';
import { ingestBook } from '../services/ingestBook';
import { isBlockedHost } from '../services/urlGuard';
import { CatalogFetchError, fetchRemoteBinary, fetchRemoteText, type RemoteTarget } from '../opdsClient/fetchRemote';
import { FeedParseError, parseFeed, parseOpenSearch } from '../opdsClient/parseFeed';
import type { OpdsFeedDto } from '../../shared/apiTypes';

export const opdsCatalogRoutes = new Hono<AppEnv>();
opdsCatalogRoutes.use('*', requireAuth);

export const FEED_TYPE = /atom\+xml|opensearchdescription|\/xml|text\/xml/i;
export const FEED_MAX_BYTES = 2_000_000;
export const IMAGE_MAX_BYTES = 5_000_000;

// Matches the raster set the book-cover ingest path already allows (RASTER_TYPES in
// ../services/ingestBook.ts). A cover from this route is served back on Spinecast's own
// origin, so an SVG (which can carry script) must not be let through as an "image".
export const IMAGE_TYPE = /^(?:image\/jpeg|image\/png|image\/gif|image\/webp)(?:;.*)?$/i;

const STATUS: Record<string, number> = { blocked_host: 400, catalog_auth: 401, catalog_unreachable: 502, not_opds: 502, too_large: 413 };

export const toApiError = (e: unknown): ApiError => {
  if (e instanceof CatalogFetchError) return new ApiError(STATUS[e.code] ?? 502, e.code, e.message);
  if (e instanceof FeedParseError) return new ApiError(502, 'bad_feed', e.message);
  return e instanceof ApiError ? e : new ApiError(502, 'catalog_unreachable', 'catalog call failed');
};

interface CatalogInput {
  name: string;
  url: string;
  username: string;
  password: string | null;
}

const readJson = async (c: { req: { json: () => Promise<unknown> } }): Promise<Record<string, unknown>> => {
  try {
    return (await c.req.json()) as Record<string, unknown>;
  } catch {
    throw new ApiError(400, 'validation', 'body must be JSON');
  }
};

const validateUrl = (raw: unknown, selfHostname: string): string => {
  if (typeof raw !== 'string' || !/^https?:\/\/[^\s/]+/.test(raw)) throw new ApiError(400, 'validation', 'url must start with http:// or https://');
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new ApiError(400, 'validation', 'url is not a valid URL');
  }
  if (isBlockedHost(url.hostname, selfHostname)) throw new ApiError(400, 'blocked_host', 'host is not allowed');
  return url.toString();
};

const validate = (body: Record<string, unknown>, current: OpdsCatalogRow | null, selfHostname: string): CatalogInput => {
  const name = typeof body['name'] === 'string' ? body['name'].trim() : current?.name ?? '';
  if (!name) throw new ApiError(400, 'validation', 'name required');
  const url = 'url' in body || !current ? validateUrl(body['url'], selfHostname) : current.url;
  const username = typeof body['username'] === 'string' ? body['username'].trim() : current?.username ?? '';
  const password = typeof body['password'] === 'string' ? body['password'] : null;
  return { name, url, username, password };
};

export const resolveCatalogUrl = (catalog: OpdsCatalogRow, href: string | undefined): URL => {
  const base = new URL(catalog.url);
  if (!href) return base;
  let url: URL;
  try {
    url = new URL(href, base);
  } catch {
    throw new ApiError(400, 'validation', 'href is not a valid URL');
  }
  if (url.origin !== base.origin) throw new ApiError(400, 'validation', 'href must stay on the catalog origin');
  return url;
};

export const targetFor = async (encKey: string, selfHostname: string, catalog: OpdsCatalogRow, url: URL): Promise<RemoteTarget> => ({
  url,
  username: catalog.username,
  password: catalog.password_enc ? await decryptString(catalog.password_enc, encKey) : '',
  selfHostname,
});

const selfHostOf = (reqUrl: string): string => new URL(reqUrl).hostname;

// A browse call needs the search template, and a catalog that advertises only an
// OpenSearch descriptor makes that one extra fetch. Nothing else re-fetches.
export const loadFeed = async (target: RemoteTarget) => {
  const feed = parseFeed(await fetchRemoteText(target, { maxBytes: FEED_MAX_BYTES, allowType: FEED_TYPE }));
  if (feed.searchTemplate || !feed.searchDescriptor) return feed;
  const descriptorUrl = new URL(feed.searchDescriptor, target.url);
  // The descriptor href is parsed out of the feed body, so it is untrusted: a hostile
  // catalog could point it at another host to have this fetch carry its Basic
  // credentials there. Only follow it when it stays on the catalog's own origin.
  if (descriptorUrl.origin !== target.url.origin) return feed;
  try {
    const xml = await fetchRemoteText({ ...target, url: descriptorUrl }, { maxBytes: FEED_MAX_BYTES, allowType: FEED_TYPE });
    return { ...feed, searchTemplate: parseOpenSearch(xml) };
  } catch {
    return feed;
  }
};

const probe = async (c: { env: AppEnv['Bindings']; req: { url: string } }, catalog: OpdsCatalogRow): Promise<void> => {
  const target = await targetFor(c.env.SYNC_ENC_KEY, selfHostOf(c.req.url), catalog, new URL(catalog.url));
  await loadFeed(target);
};

opdsCatalogRoutes.get('/', async (c) => c.json({ items: (await listCatalogs(c.env.DB, c.var.user.id)).map(toCatalogDto) }));

opdsCatalogRoutes.post('/', async (c) => {
  const input = validate(await readJson(c), null, selfHostOf(c.req.url));
  const now = Math.floor(Date.now() / 1000);
  const row: OpdsCatalogRow = {
    id: randomHex(16),
    user_id: c.var.user.id,
    name: input.name,
    url: input.url,
    username: input.username,
    password_enc: input.password ? await encryptString(input.password, c.env.SYNC_ENC_KEY) : '',
    created_at: now,
    last_ok_at: now,
    last_error: null,
  };
  try {
    await probe(c, row);
  } catch (e) {
    throw toApiError(e);
  }
  await insertCatalog(c.env.DB, row);
  return c.json(toCatalogDto(row), 201);
});

opdsCatalogRoutes.patch('/:id', async (c) => {
  const current = await findCatalog(c.env.DB, c.var.user.id, c.req.param('id'));
  if (!current) throw new ApiError(404, 'not_found', 'catalog not found');
  const body = await readJson(c);
  const input = validate(body, current, selfHostOf(c.req.url));
  // An empty password alone keeps the stored one; only an explicitly-empty
  // username alongside it clears the credential (the both-empty-clears-both rule).
  const clearCredential = input.password === '' && body['username'] === '';
  const passwordEnc = clearCredential ? '' : input.password ? await encryptString(input.password, c.env.SYNC_ENC_KEY) : current.password_enc;
  const next: OpdsCatalogRow = { ...current, name: input.name, url: input.url, username: input.username, password_enc: passwordEnc };
  try {
    await probe(c, next);
  } catch (e) {
    throw toApiError(e);
  }
  await updateCatalog(c.env.DB, c.var.user.id, current.id, { name: next.name, url: next.url, username: next.username, password_enc: next.password_enc });
  await recordCatalogResult(c.env.DB, current.id, true, null, Math.floor(Date.now() / 1000));
  return c.json(toCatalogDto((await findCatalog(c.env.DB, c.var.user.id, current.id))!));
});

opdsCatalogRoutes.delete('/:id', async (c) => {
  if (!(await deleteCatalog(c.env.DB, c.var.user.id, c.req.param('id')))) throw new ApiError(404, 'not_found', 'catalog not found');
  return c.body(null, 204);
});

const requireCatalog = async (c: Context<AppEnv>): Promise<OpdsCatalogRow> => {
  const id = c.req.param('id');
  // Without a route-specific Path generic, HonoRequest#param falls back to its
  // untyped overload (string | undefined) even though the router always supplies it.
  const catalog = id ? await findCatalog(c.env.DB, c.var.user.id, id) : null;
  if (!catalog) throw new ApiError(404, 'not_found', 'catalog not found');
  return catalog;
};

opdsCatalogRoutes.get('/:id/browse', async (c) => {
  const catalog = await requireCatalog(c);
  const url = resolveCatalogUrl(catalog, c.req.query('href'));
  const target = await targetFor(c.env.SYNC_ENC_KEY, selfHostOf(c.req.url), catalog, url);
  const now = Math.floor(Date.now() / 1000);
  let feed;
  try {
    feed = await loadFeed(target);
  } catch (e) {
    const mapped = toApiError(e);
    await recordCatalogResult(c.env.DB, catalog.id, false, mapped.code, now);
    throw mapped;
  }
  await recordCatalogResult(c.env.DB, catalog.id, true, null, now);
  const known = await listSourceEntryIds(c.env.DB, c.var.user.id, catalog.id, feed.entries.map((e) => e.id));
  const dto: OpdsFeedDto = {
    title: feed.title,
    nav: feed.nav,
    // A feed link with the epub type but no href attribute parses to acquisition: '',
    // which must not read as present - task 11 gates the download button on non-null.
    entries: feed.entries.map((e) => ({ ...e, acquisition: e.acquisition || null, inLibrary: known.get(e.id) ?? null })),
    next: feed.next,
    searchTemplate: feed.searchTemplate,
  };
  return c.json(dto);
});

opdsCatalogRoutes.get('/:id/image', async (c) => {
  const catalog = await requireCatalog(c);
  const href = c.req.query('href');
  if (!href) throw new ApiError(400, 'validation', 'href required');
  const target = await targetFor(c.env.SYNC_ENC_KEY, selfHostOf(c.req.url), catalog, resolveCatalogUrl(catalog, href));
  let got;
  try {
    got = await fetchRemoteBinary(target, { maxBytes: IMAGE_MAX_BYTES, allowType: IMAGE_TYPE });
  } catch (e) {
    throw toApiError(e);
  }
  return c.body(got.bytes as Uint8Array<ArrayBuffer>, 200, {
    'content-type': got.contentType,
    'cache-control': 'private, max-age=3600',
    'x-content-type-options': 'nosniff',
    'content-disposition': 'inline; filename="cover"',
    'content-security-policy': "default-src 'none'; img-src 'self' data:; sandbox",
  });
});

const filenameFor = (fromHeader: string | null, url: URL, entryId: string): string => {
  const candidate = fromHeader ?? decodeURIComponent(url.pathname.split('/').pop() ?? '');
  const named = candidate && candidate !== '/' ? candidate : `${entryId}.epub`;
  return named.toLowerCase().endsWith('.epub') ? named : `${named}.epub`;
};

opdsCatalogRoutes.post('/:id/import', async (c) => {
  const catalog = await requireCatalog(c);
  const body = await readJson(c);
  const href = typeof body['href'] === 'string' ? body['href'] : '';
  const entryId = typeof body['entryId'] === 'string' ? body['entryId'].trim() : '';
  if (!href) throw new ApiError(400, 'validation', 'href required');
  if (!entryId) throw new ApiError(400, 'validation', 'entryId required');

  const url = resolveCatalogUrl(catalog, href);
  const target = await targetFor(c.env.SYNC_ENC_KEY, selfHostOf(c.req.url), catalog, url);
  let got;
  try {
    got = await fetchRemoteBinary(target, { maxBytes: Number(c.env.MAX_UPLOAD_BYTES), allowType: /^/ });
  } catch (e) {
    throw toApiError(e);
  }

  let res;
  try {
    res = await ingestBook(c.env.DB, c.env.BOOKS, {
      userId: c.var.user.id,
      filename: filenameFor(got.filename, url, entryId),
      bytes: got.bytes,
      source: { catalogId: catalog.id, entryId },
    });
  } catch (e) {
    if (e instanceof EpubParseError) throw new ApiError(400, 'not_epub', e.message);
    throw e;
  }
  if (!res.ok) {
    await setBookSourceIfUnset(c.env.DB, res.bookId, catalog.id, entryId);
    return c.json({ error: { code: 'duplicate', message: 'already in library', bookId: res.bookId } }, 409);
  }
  return c.json(await findBookWithProgress(c.env.DB, c.var.user.id, res.bookId), 201);
});
