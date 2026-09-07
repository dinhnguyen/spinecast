import { afterEach, describe, expect, it } from 'vitest';
import { createMockOpdsCatalog } from '../../../test/mockOpdsCatalog';
import { FEED_TYPE, IMAGE_TYPE } from '../routes/opdsCatalogs';
import { CatalogFetchError, fetchRemoteBinary, fetchRemoteText, setCatalogFetchForTests, usesSelfBinding } from './fetchRemote';

const target = (path: string, creds: { username?: string; password?: string } = {}) => ({
  url: new URL(`https://books.test${path}`),
  username: creds.username ?? '',
  password: creds.password ?? '',
  selfHostname: 'spinecast.test',
});

let inits: RequestInit[] = [];
const recording = (mockFetch: typeof fetch): typeof fetch =>
  ((url, init) => {
    inits.push(init!);
    return mockFetch(url, init);
  }) as typeof fetch;

afterEach(() => {
  setCatalogFetchForTests(null);
  inits = [];
});

describe('fetchRemoteText', () => {
  it('returns the feed body and sends no auth header when there are no credentials', async () => {
    const mock = createMockOpdsCatalog();
    setCatalogFetchForTests(recording(mock.fetch));
    const body = await fetchRemoteText(target('/opds'), { maxBytes: 2_000_000, allowType: FEED_TYPE });
    expect(body).toContain('<title>Calibre Library</title>');
    expect(inits.length).toBeGreaterThan(0);
    for (const init of inits) {
      expect((init.headers as Record<string, string>).authorization).toBeUndefined();
    }
  });

  it('sends Basic auth and maps a 401 to catalog_auth', async () => {
    const mock = createMockOpdsCatalog({ username: 'me', password: 'pw' });
    setCatalogFetchForTests(recording(mock.fetch));
    await expect(fetchRemoteText(target('/opds'), { maxBytes: 2_000_000, allowType: FEED_TYPE })).rejects.toMatchObject({ code: 'catalog_auth' });
    inits = [];
    const body = await fetchRemoteText(target('/opds', { username: 'me', password: 'pw' }), { maxBytes: 2_000_000, allowType: FEED_TYPE });
    expect(body).toContain('Calibre Library');
    expect(inits.length).toBeGreaterThan(0);
    for (const init of inits) {
      expect((init.headers as Record<string, string>).authorization).toBe(`Basic ${btoa('me:pw')}`);
    }
  });

  it('sends the credential when only a password is set, which is what a token catalog wants', async () => {
    // Spinecast's own feed ignores the username and checks the token as the
    // password, so a source pointing back at Spinecast has no username to give.
    const mock = createMockOpdsCatalog({ password: 'kyx4i7yyw6l3bpwu7woo7dnm' });
    setCatalogFetchForTests(recording(mock.fetch));
    await expect(fetchRemoteText(target('/opds'), { maxBytes: 2_000_000, allowType: FEED_TYPE })).rejects.toMatchObject({
      code: 'catalog_auth',
    });
    inits = [];
    const body = await fetchRemoteText(target('/opds', { password: 'kyx4i7yyw6l3bpwu7woo7dnm' }), {
      maxBytes: 2_000_000,
      allowType: FEED_TYPE,
    });
    expect(body).toContain('Calibre Library');
    for (const init of inits) {
      expect((init.headers as Record<string, string>).authorization).toBe(`Basic ${btoa(':kyx4i7yyw6l3bpwu7woo7dnm')}`);
    }
  });

  it('encodes the credential as UTF-8 rather than throwing on it', async () => {
    const mock = createMockOpdsCatalog();
    setCatalogFetchForTests(recording(mock.fetch));
    await fetchRemoteText(target('/opds', { username: 'Định', password: 'mật khẩu' }), {
      maxBytes: 2_000_000,
      allowType: FEED_TYPE,
    });
    const header = (inits[0]!.headers as Record<string, string>).authorization!;
    const bytes = Uint8Array.from(atob(header.slice('Basic '.length)), (ch) => ch.charCodeAt(0));
    expect(new TextDecoder().decode(bytes)).toBe('Định:mật khẩu');
  });

  it('maps a 500 to catalog_unreachable and a transport failure too', async () => {
    const mock = createMockOpdsCatalog();
    setCatalogFetchForTests(mock.fetch);
    await expect(fetchRemoteText(target('/boom'), { maxBytes: 2_000_000, allowType: FEED_TYPE })).rejects.toMatchObject({ code: 'catalog_unreachable' });
    setCatalogFetchForTests(() => Promise.reject(new Error('dns')));
    await expect(fetchRemoteText(target('/opds'), { maxBytes: 2_000_000, allowType: FEED_TYPE })).rejects.toMatchObject({ code: 'catalog_unreachable' });
  });

  it('rejects a content type that is not a feed', async () => {
    const mock = createMockOpdsCatalog();
    setCatalogFetchForTests(mock.fetch);
    await expect(fetchRemoteText(target('/html'), { maxBytes: 2_000_000, allowType: FEED_TYPE })).rejects.toMatchObject({ code: 'not_opds' });
  });

  it('accepts a feed content type in any casing', async () => {
    const mock = createMockOpdsCatalog();
    setCatalogFetchForTests(mock.fetch);
    const body = await fetchRemoteText(target('/opds-caps'), { maxBytes: 2_000_000, allowType: FEED_TYPE });
    expect(body).toContain('Calibre Library');
  });

  it('trips the size cap', async () => {
    const mock = createMockOpdsCatalog();
    setCatalogFetchForTests(mock.fetch);
    await expect(fetchRemoteText(target('/opds'), { maxBytes: 20, allowType: FEED_TYPE })).rejects.toMatchObject({ code: 'too_large' });
  });

  it('blocks a private host and blocks a redirect that walks to one', async () => {
    const mock = createMockOpdsCatalog();
    setCatalogFetchForTests(recording(mock.fetch));
    await expect(
      fetchRemoteText({ url: new URL('http://169.254.169.254/opds'), username: '', password: '', selfHostname: 'spinecast.test' }, { maxBytes: 2_000_000, allowType: FEED_TYPE }),
    ).rejects.toMatchObject({ code: 'blocked_host' });

    inits = [];
    mock.setRedirect('http://169.254.169.254/latest/meta-data');
    await expect(fetchRemoteText(target('/hop'), { maxBytes: 2_000_000, allowType: FEED_TYPE })).rejects.toMatchObject({ code: 'blocked_host' });
    expect(inits.length).toBeGreaterThan(0);
    for (const init of inits) {
      expect(init.redirect).toBe('manual');
    }
  });

  it('drops the auth header when a redirect moves to a different origin, keeping it on the first hop', async () => {
    setCatalogFetchForTests(
      recording((async (url) => {
        const u = new URL(url as string);
        if (u.origin === 'https://books.test') return new Response(null, { status: 302, headers: { location: 'https://other.test/opds' } });
        return new Response('<feed xmlns="http://www.w3.org/2005/Atom"><title>Other Library</title></feed>', { status: 200, headers: { 'content-type': 'application/atom+xml' } });
      }) as typeof fetch),
    );
    const body = await fetchRemoteText(target('/hop', { username: 'me', password: 'pw' }), { maxBytes: 2_000_000, allowType: FEED_TYPE });
    expect(body).toContain('Other Library');
    expect(inits.length).toBe(2);
    expect((inits[0]!.headers as Record<string, string>).authorization).toBe(`Basic ${btoa('me:pw')}`);
    expect((inits[1]!.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it('follows a same-host redirect, at most three hops', async () => {
    const mock = createMockOpdsCatalog();
    setCatalogFetchForTests(recording(mock.fetch));
    mock.setRedirect('/opds');
    expect(await fetchRemoteText(target('/hop'), { maxBytes: 2_000_000, allowType: FEED_TYPE })).toContain('Calibre Library');
    expect(inits.length).toBeGreaterThan(1);
    for (const init of inits) {
      expect(init.redirect).toBe('manual');
    }
    inits = [];
    mock.setRedirect('/hop');
    await expect(fetchRemoteText(target('/hop'), { maxBytes: 2_000_000, allowType: FEED_TYPE })).rejects.toMatchObject({ code: 'catalog_unreachable' });
    expect(inits.length).toBeGreaterThan(1);
    for (const init of inits) {
      expect(init.redirect).toBe('manual');
    }
  });

  it('rejects a non-http scheme', async () => {
    await expect(
      fetchRemoteText({ url: new URL('file:///etc/passwd'), username: '', password: '', selfHostname: 'spinecast.test' }, { maxBytes: 10, allowType: FEED_TYPE }),
    ).rejects.toMatchObject({ code: 'blocked_host' });
  });

  it('allows the worker own hostname', async () => {
    const mock = createMockOpdsCatalog();
    setCatalogFetchForTests(mock.fetch);
    const body = await fetchRemoteText({ url: new URL('http://localhost/opds'), username: '', password: '', selfHostname: 'localhost' }, { maxBytes: 2_000_000, allowType: FEED_TYPE });
    expect(body).toContain('Calibre Library');
  });
});

describe('fetchRemoteBinary', () => {
  it('returns bytes, content type and the filename from content-disposition', async () => {
    const mock = createMockOpdsCatalog();
    setCatalogFetchForTests(mock.fetch);
    const got = await fetchRemoteBinary(target('/get/EPUB/1'), { maxBytes: 1_000_000, allowType: /./ });
    expect(got.bytes.length).toBeGreaterThan(100);
    expect(got.contentType).toContain('epub');
    expect(got.filename).toBe('Remote Book.epub');
  });

  it('falls back to the plain filename when the RFC 5987 filename* is malformed', async () => {
    const mock = createMockOpdsCatalog();
    setCatalogFetchForTests(mock.fetch);
    const got = await fetchRemoteBinary(target('/get/EPUB-badname/1'), { maxBytes: 1_000_000, allowType: /./ });
    expect(got.filename).toBe('fallback.epub');
  });

  it('rejects a non-image when the caller asks for images', async () => {
    const mock = createMockOpdsCatalog();
    setCatalogFetchForTests(mock.fetch);
    expect((await fetchRemoteBinary(target('/get/thumb/1'), { maxBytes: 1000, allowType: IMAGE_TYPE })).contentType).toBe('image/png');
    await expect(fetchRemoteBinary(target('/get/EPUB/1'), { maxBytes: 1_000_000, allowType: IMAGE_TYPE })).rejects.toMatchObject({ code: 'not_opds' });
  });

  it('accepts an allowed raster type in any casing but still refuses an SVG cover in any casing', async () => {
    const mock = createMockOpdsCatalog();
    setCatalogFetchForTests(mock.fetch);
    expect((await fetchRemoteBinary(target('/get/thumb-caps/1'), { maxBytes: 1000, allowType: IMAGE_TYPE })).contentType).toBe('IMAGE/PNG');
    await expect(fetchRemoteBinary(target('/get/svg/1'), { maxBytes: 1000, allowType: IMAGE_TYPE })).rejects.toMatchObject({ code: 'not_opds' });
    await expect(fetchRemoteBinary(target('/get/svg-caps/1'), { maxBytes: 1000, allowType: IMAGE_TYPE })).rejects.toMatchObject({ code: 'not_opds' });
  });
});

describe('usesSelfBinding', () => {
  // Cloudflare answers a Worker's subrequest to its own zone with a 522: it looks
  // for the zone's origin instead of re-entering the Worker, and there is no
  // origin. Our own hostname has to go through the service binding.
  const self = {} as unknown as Fetcher;

  it('is true only for our own hostname, and only when the binding is there', () => {
    const t = { ...target('/opds'), selfHostname: 'book.dinhnn.com', self };
    expect(usesSelfBinding(new URL('https://book.dinhnn.com/opds/x/public'), t)).toBe(true);
    expect(usesSelfBinding(new URL('https://books.test/opds'), t)).toBe(false);
    const { self: _dropped, ...noBinding } = t;
    expect(usesSelfBinding(new URL('https://book.dinhnn.com/opds/x/public'), noBinding)).toBe(false);
  });

  it('follows a redirect off our origin back onto the global fetch', () => {
    const t = { ...target('/opds'), selfHostname: 'book.dinhnn.com', self };
    expect(usesSelfBinding(new URL('https://book.dinhnn.com/a'), t)).toBe(true);
    expect(usesSelfBinding(new URL('https://elsewhere.test/a'), t)).toBe(false);
  });
});
