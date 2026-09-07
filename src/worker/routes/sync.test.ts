import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { app } from '../app';
import { setSyncFetchForTests } from '../sync/syncService';
import { createUserAndLogin, jsonRequest } from '../../../test/helpers';
import { createMockCrosspoint } from '../../../test/mockCrosspoint';

const SETTINGS = { enabled: true, serverUrl: 'https://sync.test', username: 'justin', password: 'hunter2-not-real', hashMethod: 'partial' };

describe('sync settings', () => {
  it('stores settings with an encrypted md5 key and never returns the key', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    const put = await app.request(...jsonRequest('/api/sync/settings', 'PUT', SETTINGS, cookie), env);
    expect(put.status).toBe(200);
    const dto = await put.json();
    expect(dto).toMatchObject({ enabled: true, serverUrl: 'https://sync.test', username: 'justin', hasCredentials: true, hashMethod: 'partial' });
    expect(JSON.stringify(dto)).not.toContain('hunter2');
    const row = await env.DB.prepare('select auth_key_enc from sync_settings where user_id = ?').bind(user.id).first<{ auth_key_enc: string }>();
    expect(row?.auth_key_enc).not.toContain('hunter2');
    expect(row?.auth_key_enc).toMatch(/^[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/);
  });

  it('keeps the stored key when password is omitted on update', async () => {
    const { cookie } = await createUserAndLogin(env);
    await app.request(...jsonRequest('/api/sync/settings', 'PUT', SETTINGS, cookie), env);
    const second = await (await app.request(...jsonRequest('/api/sync/settings', 'PUT', { ...SETTINGS, password: undefined }, cookie), env)).json();
    expect(second.hasCredentials).toBe(true);
  });

  it('rejects a malformed json body with 400 validation', async () => {
    const { cookie } = await createUserAndLogin(env);
    const res = await app.request('/api/sync/settings', { method: 'PUT', headers: { 'content-type': 'application/json', cookie }, body: '{not json' }, env);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('validation');
  });

  it('rejects invalid urls and hash methods', async () => {
    const { cookie } = await createUserAndLogin(env);
    const bad = await app.request(...jsonRequest('/api/sync/settings', 'PUT', { ...SETTINGS, serverUrl: 'ftp://x' }, cookie), env);
    expect(bad.status).toBe(400);
    const bad2 = await app.request(...jsonRequest('/api/sync/settings', 'PUT', { ...SETTINGS, hashMethod: 'sha' }, cookie), env);
    expect(bad2.status).toBe(400);
  });

  it('rejects loopback, private and link-local server addresses', async () => {
    const { cookie } = await createUserAndLogin(env);
    for (const serverUrl of ['http://127.0.0.1:8080', 'http://localhost:8080', 'http://192.168.1.5', 'http://169.254.169.254']) {
      const res = await app.request(...jsonRequest('/api/sync/settings', 'PUT', { ...SETTINGS, serverUrl }, cookie), env);
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe('validation');
    }
    const ok = await app.request(...jsonRequest('/api/sync/settings', 'PUT', SETTINGS, cookie), env);
    expect(ok.status).toBe(200);
  });

  it('rejects the bracketed ipv6 loopback address', async () => {
    const { cookie } = await createUserAndLogin(env);
    const res = await app.request(...jsonRequest('/api/sync/settings', 'PUT', { ...SETTINGS, serverUrl: 'http://[::1]:8080' }, cookie), env);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('validation');
  });

  it('tests the connection against the server and records the result', async () => {
    const mock = createMockCrosspoint();
    setSyncFetchForTests(mock.fetch);
    const { cookie } = await createUserAndLogin(env);
    // md5('hunter2-not-real') must match the mock's stored key for justin
    mock.state.users.set('justin', await (await import('../services/crypto')).md5Hex('hunter2-not-real'));
    await app.request(...jsonRequest('/api/sync/settings', 'PUT', SETTINGS, cookie), env);
    const ok = await app.request(...jsonRequest('/api/sync/test', 'POST', undefined, cookie), env);
    expect(ok.status).toBe(200);
    const dto = await (await app.request(...jsonRequest('/api/sync/settings', 'GET', undefined, cookie), env)).json();
    expect(dto.lastOkAt).not.toBeNull();
    expect(dto.lastError).toBeNull();
    mock.state.users.set('justin', 'changed');
    const fail = await app.request(...jsonRequest('/api/sync/test', 'POST', undefined, cookie), env);
    expect(fail.status).toBe(502);
    expect((await fail.json()).error.code).toBe('sync_unauthorized');
    setSyncFetchForTests(null);
  });

  it('returns defaults when nothing is configured', async () => {
    const { cookie } = await createUserAndLogin(env);
    const res = await app.request(...jsonRequest('/api/sync/settings', 'GET', undefined, cookie), env);
    expect(await res.json()).toMatchObject({ enabled: false, hasCredentials: false, serverUrl: '', username: '' });
  });
});
