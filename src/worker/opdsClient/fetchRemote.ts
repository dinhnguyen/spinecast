import { isBlockedHost } from '../services/urlGuard';

export type CatalogErrorCode = 'blocked_host' | 'catalog_auth' | 'catalog_unreachable' | 'not_opds' | 'too_large';

export class CatalogFetchError extends Error {
  constructor(
    public readonly code: CatalogErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'CatalogFetchError';
  }
}

export interface RemoteTarget {
  url: URL;
  username: string;
  password: string;
  selfHostname: string;
}

interface FetchOpts {
  maxBytes: number;
  allowType: RegExp;
}

let fetchOverride: typeof fetch | null = null;

// Tests swap the transport so the Worker talks to an in-process mock catalog.
export const setCatalogFetchForTests = (f: typeof fetch | null): void => {
  fetchOverride = f;
};

const MAX_HOPS = 3;

const guard = (url: URL, selfHostname: string): void => {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new CatalogFetchError('blocked_host', 'only http and https are allowed');
  if (isBlockedHost(url.hostname, selfHostname)) throw new CatalogFetchError('blocked_host', 'host is not allowed');
};

// RFC 7617 leaves the charset to the server, and UTF-8 is what browsers send;
// btoa on its own throws on anything outside Latin-1, which a password with a
// Vietnamese character would have done.
const basicAuth = (username: string, password: string): string => {
  let latin1 = '';
  for (const byte of new TextEncoder().encode(`${username}:${password}`)) latin1 += String.fromCharCode(byte);
  return `Basic ${btoa(latin1)}`;
};

// A credential with no username still goes out: Spinecast's own OPDS feed checks
// the password alone (the token), as does any catalog handing out bare tokens, so
// gating this on the username left the app unable to subscribe to its own catalog.
const authHeaders = (t: RemoteTarget): Record<string, string> =>
  t.username || t.password ? { authorization: basicAuth(t.username, t.password) } : {};

// Redirects are handled by hand: fetch's own following would jump to a host the
// guard never sees, which is a straight path to the cloud metadata endpoint.
const send = async (t: RemoteTarget): Promise<Response> => {
  const doFetch = fetchOverride ?? fetch;
  const originalOrigin = t.url.origin;
  let url = t.url;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    guard(url, t.selfHostname);
    let res: Response;
    try {
      // The catalog itself picks a redirect target, so its credentials must not
      // follow it off the origin they were meant for.
      const headers = { accept: '*/*', ...(url.origin === originalOrigin ? authHeaders(t) : {}) };
      res = await doFetch(url.toString(), { headers, redirect: 'manual' });
    } catch {
      throw new CatalogFetchError('catalog_unreachable', 'request failed');
    }
    if (res.status === 401 || res.status === 403) throw new CatalogFetchError('catalog_auth', 'catalog rejected the credentials');
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      await res.body?.cancel();
      if (!location) throw new CatalogFetchError('catalog_unreachable', 'redirect without a location');
      url = new URL(location, url);
      continue;
    }
    if (!res.ok) throw new CatalogFetchError('catalog_unreachable', `catalog answered ${res.status}`);
    return res;
  }
  throw new CatalogFetchError('catalog_unreachable', 'too many redirects');
};

const checkType = (res: Response, allowType: RegExp): string => {
  const type = res.headers.get('content-type') ?? '';
  if (!allowType.test(type)) throw new CatalogFetchError('not_opds', `unexpected content type ${type || 'none'}`);
  return type;
};

// content-length is advisory: absent on chunked responses and trivially wrong
// on a hostile one, so the cap is enforced while draining the body as well.
const readCapped = async (res: Response, maxBytes: number): Promise<Uint8Array> => {
  const declared = Number(res.headers.get('content-length') ?? '0');
  if (declared > maxBytes) throw new CatalogFetchError('too_large', 'response exceeds the cap');
  const reader = res.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      throw new CatalogFetchError('too_large', 'response exceeds the cap');
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) {
    out.set(c, pos);
    pos += c.length;
  }
  return out;
};

const filenameFrom = (res: Response): string | null => {
  const cd = res.headers.get('content-disposition');
  if (!cd) return null;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  if (star) {
    try {
      return decodeURIComponent(star[1]!.trim());
    } catch {
      // A malformed filename* falls through to the plain filename below.
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(cd);
  return plain ? plain[1]!.trim() : null;
};

export const fetchRemoteText = async (t: RemoteTarget, opts: FetchOpts): Promise<string> => {
  const res = await send(t);
  checkType(res, opts.allowType);
  return new TextDecoder().decode(await readCapped(res, opts.maxBytes));
};

export const fetchRemoteBinary = async (t: RemoteTarget, opts: FetchOpts): Promise<{ bytes: Uint8Array; contentType: string; filename: string | null }> => {
  const res = await send(t);
  const contentType = checkType(res, opts.allowType);
  const filename = filenameFrom(res);
  return { bytes: await readCapped(res, opts.maxBytes), contentType, filename };
};
