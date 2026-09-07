import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../app';
import { md5Hex } from '../services/crypto';
import { setSyncFetchForTests } from '../sync/syncService';
import { createUserAndLogin, firstDeviceId, jsonRequest, uploadFixture } from '../../../test/helpers';
import { createMockCrosspoint } from '../../../test/mockCrosspoint';

const configure = async (cookie: string, mock: ReturnType<typeof createMockCrosspoint>, hashMethod = 'partial') => {
  mock.state.users.set('justin', await md5Hex('pw'));
  const res = await app.request(
    ...jsonRequest('/api/sync/settings', 'PUT', { enabled: true, serverUrl: 'https://sync.test', username: 'justin', password: 'pw', hashMethod }, cookie),
    env,
  );
  return res.json();
};

describe('progress sync', () => {
  let mock: ReturnType<typeof createMockCrosspoint>;
  beforeEach(() => {
    mock = createMockCrosspoint();
    setSyncFetchForTests(mock.fetch);
  });
  afterEach(() => setSyncFetchForTests(null));

  it('pushes progress with position and metadata under the partial hash', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    await configure(cookie, mock);
    const book = await uploadFixture(env, cookie, 'Minimal Book.epub');
    const pos = { pctQ: 400000, spine: 1, xpath: '/body/DocFragment[2]/body/p[2]', para: 2 };
    const res = await (await app.request(...jsonRequest(`/api/books/${book.id}/progress`, 'PUT', pos, cookie), env)).json();
    expect(res.pushed).toBe(true);
    expect(res.local.lastPushedAt).not.toBeNull();
    const remote = mock.state.progress.get(book.hashPartial);
    expect(remote).toMatchObject({ percentage: 0.4, progress: pos.xpath, device: 'Spinecast', device_id: await firstDeviceId(env, user.id) });
    expect(remote?.position).toEqual(pos);
    expect(remote?.metadata).toEqual({ filename: 'Minimal Book.epub', title: 'Minimal Book', authors: 'Test Author' });
  });

  it('uses the filename hash when configured', async () => {
    const { cookie } = await createUserAndLogin(env);
    await configure(cookie, mock, 'filename');
    const book = await uploadFixture(env, cookie, 'Foundryside - Robert Jackson Bennett.epub');
    await app.request(...jsonRequest(`/api/books/${book.id}/progress`, 'PUT', { pctQ: 1, spine: 0 }, cookie), env);
    expect(mock.state.progress.has('25f8abb4f4f5594f02f361726814fea1')).toBe(true);
  });

  it('keeps reading working when the server is down and reports the error', async () => {
    const { cookie } = await createUserAndLogin(env);
    await configure(cookie, mock);
    setSyncFetchForTests(() => Promise.reject(new TypeError('down')));
    const book = await uploadFixture(env, cookie);
    const res = await app.request(...jsonRequest(`/api/books/${book.id}/progress`, 'PUT', { pctQ: 5, spine: 0 }, cookie), env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.pushed).toBe(false);
    expect(body.syncError).toContain('network');
    expect(body.local.lastPushedAt).toBeNull();
    const settings = await (await app.request(...jsonRequest('/api/sync/settings', 'GET', undefined, cookie), env)).json();
    expect(settings.lastError).toContain('network');
  });

  it('returns the newest remote row on GET with its rich position when available', async () => {
    const { cookie } = await createUserAndLogin(env);
    await configure(cookie, mock);
    const book = await uploadFixture(env, cookie);
    mock.state.progress.set(book.hashPartial, {
      document: book.hashPartial, progress: '/body/DocFragment[1]/body/p[5]', percentage: 0.9, device: 'CrossInk', device_id: 'A1B2', timestamp: 1_800_000_000,
      position: { pctQ: 900000, spine: 0, xpath: '/body/DocFragment[1]/body/p[5]', para: 5 },
    });
    const res = await (await app.request(...jsonRequest(`/api/books/${book.id}/progress`, 'GET', undefined, cookie), env)).json();
    expect(res.remote).toMatchObject({ device: 'CrossInk', deviceId: 'A1B2', percentage: 0.9, timestamp: 1_800_000_000 });
    expect(res.remote.position).toEqual({ pctQ: 900000, spine: 0, xpath: '/body/DocFragment[1]/body/p[5]', para: 5 });
  });

  it('lists remote documents annotated with matching local book ids', async () => {
    const { cookie } = await createUserAndLogin(env);
    await configure(cookie, mock);
    const book = await uploadFixture(env, cookie);
    mock.state.progress.set(book.hashPartial, { document: book.hashPartial, progress: 'x', percentage: 0.1, device: 'd', device_id: 'd1', timestamp: 2 });
    mock.state.progress.set('ffff', { document: 'ffff', progress: 'x', percentage: 0.2, device: 'd', device_id: 'd1', timestamp: 3, metadata: { title: 'Elsewhere' } });
    const res = await (await app.request(...jsonRequest('/api/sync/remote-documents', 'GET', undefined, cookie), env)).json();
    expect(res.items).toHaveLength(2);
    expect(res.items.find((i: { document: string }) => i.document === book.hashPartial).bookId).toBe(book.id);
    expect(res.items.find((i: { document: string }) => i.document === 'ffff').bookId).toBeNull();
  });

  it('does not push a rejected stale write to the sync server', async () => {
    const { cookie } = await createUserAndLogin(env);
    await configure(cookie, mock);
    const book = await uploadFixture(env, cookie);
    await app.request(...jsonRequest(`/api/books/${book.id}/progress`, 'PUT', { pctQ: 500_000, spine: 9, observedAt: 2_000 }, cookie), env);
    const before = mock.state.progress.get(book.hashPartial);

    const stale = await (
      await app.request(...jsonRequest(`/api/books/${book.id}/progress`, 'PUT', { pctQ: 100_000, spine: 2, observedAt: 1_000 }, cookie), env)
    ).json();
    expect(stale.pushed).toBe(false);
    expect(mock.state.progress.get(book.hashPartial)).toEqual(before);
  });

  it('pushes the session device rather than a per-user one', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    await configure(cookie, mock);
    const book = await uploadFixture(env, cookie, 'Minimal Book.epub');
    await app.request(...jsonRequest(`/api/books/${book.id}/progress`, 'PUT', { pctQ: 250_000, spine: 3, observedAt: 5_000 }, cookie), env);

    const pushed = mock.state.progress.get(book.hashPartial);
    expect(pushed?.device_id).toBe(await firstDeviceId(env, user.id));
    expect(pushed?.device).toBe('Spinecast');
  });
});
