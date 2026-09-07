import { describe, expect, it } from 'vitest';
import { CrosspointClient, CrosspointError } from './crosspointClient';
import { createMockCrosspoint } from '../../../test/mockCrosspoint';

const make = (authKey = '0f359740bd1cda994f8b55330c86d845') => {
  const mock = createMockCrosspoint();
  const client = new CrosspointClient({ serverUrl: 'https://sync.test', username: 'justin', authKey, fetchImpl: mock.fetch });
  return { mock, client };
};

describe('CrosspointClient', () => {
  it('authenticates with x-auth headers', async () => {
    const { client } = make();
    await expect(client.auth()).resolves.toBeUndefined();
  });

  it('maps 401 to an unauthorized error', async () => {
    const { client } = make('badkey');
    await expect(client.auth()).rejects.toMatchObject({ kind: 'unauthorized', status: 401 } satisfies Partial<CrosspointError>);
  });

  it('puts and gets progress, and returns null for the empty-object quirk', async () => {
    const { client } = make();
    expect(await client.getProgress('a1b2')).toBeNull();
    const res = await client.putProgress({
      document: 'a1b2', progress: '/body/DocFragment[2]/body/p[1]', percentage: 0.25, device: 'Spinecast', device_id: 'spinecast-1',
      position: { pctQ: 250000, spine: 1, xpath: '/body/DocFragment[2]/body/p[1]' },
      metadata: { title: 'T', authors: 'A', filename: 'f.epub' },
    });
    expect(res.document).toBe('a1b2');
    const got = await client.getProgress('a1b2');
    expect(got?.percentage).toBe(0.25);
    expect(got?.timestamp).toBe(res.timestamp);
    const list = await client.listProgress();
    expect(list[0]).toMatchObject({ document: 'a1b2', title: 'T', author: 'A', filename: 'f.epub' });
  });

  it('maps network failures and timeouts', async () => {
    const failing: typeof fetch = () => Promise.reject(new TypeError('fetch failed'));
    const client = new CrosspointClient({ serverUrl: 'https://down.test', username: 'u', authKey: 'k', fetchImpl: failing });
    await expect(client.auth()).rejects.toMatchObject({ kind: 'network' });
    const slow: typeof fetch = () => new Promise(() => {});
    const timing = new CrosspointClient({ serverUrl: 'https://slow.test', username: 'u', authKey: 'k', fetchImpl: slow, timeoutMs: 20 });
    await expect(timing.auth()).rejects.toMatchObject({ kind: 'network' });
  });

  it('truncates an oversized error body before it reaches the error message', async () => {
    const huge: typeof fetch = () => Promise.resolve(new Response('x'.repeat(50_000), { status: 500 }));
    const client = new CrosspointClient({ serverUrl: 'https://sync.test', username: 'u', authKey: 'k', fetchImpl: huge });
    const err = await client.auth().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CrosspointError);
    expect((err as CrosspointError).message.length).toBeLessThanOrEqual(300);
  });

  it('strips trailing slashes from the server url', async () => {
    const mock = createMockCrosspoint();
    const client = new CrosspointClient({ serverUrl: 'https://sync.test/', username: 'justin', authKey: '0f359740bd1cda994f8b55330c86d845', fetchImpl: mock.fetch });
    await expect(client.auth()).resolves.toBeUndefined();
  });
});

describe('CrosspointClient default fetch', () => {
  // Every other test injects fetchImpl, so the `?? fetch` branch was never exercised and
  // an unbound global fetch shipped: workerd threw "Illegal invocation" against every real
  // server while the whole suite stayed green. This drives that branch on purpose.
  it('uses a bound global fetch, not a detached one', async () => {
    const client = new CrosspointClient({
      serverUrl: 'http://127.0.0.1:1',
      username: 'u',
      authKey: '0f359740bd1cda994f8b55330c86d845',
      timeoutMs: 2_000,
    });
    const err = await client.getProgress('doc').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CrosspointError);
    expect((err as CrosspointError).message).not.toContain('Illegal invocation');
  });
});
