import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { app } from '../app';
import { insertInvite } from '../db/invites';
import { insertDevice, listDevices } from '../db/devices';
import { createUser, createUserAndLogin, firstDeviceId, jsonRequest, login } from '../../../test/helpers';
import type { UserDto } from '../../shared/apiTypes';

describe('auth', () => {
  it('logs in with valid credentials and sets an httpOnly cookie', async () => {
    const user = await createUser(env, { password: 'pw-123456' });
    const res = await app.request(...jsonRequest('/api/auth/login', 'POST', { email: user.email, password: 'pw-123456' }), env);
    expect(res.status).toBe(200);
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/^session=[0-9a-f]{64}; /);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(await res.json()).toEqual({
      id: user.id,
      slug: user.slug,
      email: user.email,
      role: 'user',
      locale: 'vi',
      deviceId: await firstDeviceId(env, user.id),
    });
  });

  it('reuses the device row a browser claims instead of minting one per login', async () => {
    const user = await createUser(env, { password: 'pw-123456' });
    const first = await app.request(...jsonRequest('/api/auth/login', 'POST', { email: user.email, password: 'pw-123456' }), env);
    const { deviceId } = (await first.json()) as UserDto;

    const again = await app.request(
      '/api/auth/login',
      { method: 'POST', headers: { 'content-type': 'application/json', 'x-device-id': deviceId! }, body: JSON.stringify({ email: user.email, password: 'pw-123456' }) },
      env,
    );
    expect(((await again.json()) as UserDto).deviceId).toBe(deviceId);
    expect(await listDevices(env.DB, user.id)).toHaveLength(1);
  });

  it('mints a new device when the claimed id is malformed or belongs to someone else', async () => {
    const owner = await createUser(env, { password: 'pw-123456' });
    const other = await createUser(env, { password: 'pw-123456' });
    const ownerLogin = await app.request(...jsonRequest('/api/auth/login', 'POST', { email: owner.email, password: 'pw-123456' }), env);
    const ownerDevice = ((await ownerLogin.json()) as UserDto).deviceId!;

    const claim = async (email: string, id: string): Promise<string> => {
      const res = await app.request(
        '/api/auth/login',
        { method: 'POST', headers: { 'content-type': 'application/json', 'x-device-id': id }, body: JSON.stringify({ email, password: 'pw-123456' }) },
        env,
      );
      return ((await res.json()) as UserDto).deviceId!;
    };

    expect(await claim(other.email, ownerDevice)).not.toBe(ownerDevice);
    expect(await claim(owner.email, 'dev-notahexstring')).not.toBe(ownerDevice);
    expect(await listDevices(env.DB, owner.id)).toHaveLength(2);
    expect(await listDevices(env.DB, other.id)).toHaveLength(1);
  });

  it('rejects a wrong password with 401', async () => {
    const user = await createUser(env);
    const res = await app.request(...jsonRequest('/api/auth/login', 'POST', { email: user.email, password: 'nope' }), env);
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe('invalid_credentials');
  });

  it('rejects a correct password for a disabled account without setting a cookie', async () => {
    const user = await createUser(env, { password: 'pw-123456' });
    await env.DB.prepare('update users set disabled_at = 1 where id = ?').bind(user.id).run();
    const res = await app.request(...jsonRequest('/api/auth/login', 'POST', { email: user.email, password: 'pw-123456' }), env);
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('account_disabled');
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('returns the current user on /me and 401 without a cookie', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    const ok = await app.request(...jsonRequest('/api/auth/me', 'GET', undefined, cookie), env);
    expect(ok.status).toBe(200);
    expect((await ok.json()).email).toBe(user.email);
    const anon = await app.request('/api/auth/me', {}, env);
    expect(anon.status).toBe(401);
  });

  it('rejects a live cookie when disabled, and an old epoch after unlock', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    await env.DB.prepare('update users set disabled_at = 1, session_epoch = 1 where id = ?').bind(user.id).run();
    const locked = await app.request(...jsonRequest('/api/auth/me', 'GET', undefined, cookie), env);
    expect(locked.status).toBe(401);
    expect((await locked.json()).error.code).toBe('account_disabled');
    await env.DB.prepare('update users set disabled_at = null where id = ?').bind(user.id).run();
    const stale = await app.request(...jsonRequest('/api/auth/me', 'GET', undefined, cookie), env);
    expect(stale.status).toBe(401);
    expect((await stale.json()).error.code).toBe('unauthorized');
  });

  it('logs out and invalidates the session', async () => {
    const { cookie } = await createUserAndLogin(env);
    const out = await app.request(...jsonRequest('/api/auth/logout', 'POST', undefined, cookie), env);
    expect(out.status).toBe(204);
    const me = await app.request(...jsonRequest('/api/auth/me', 'GET', undefined, cookie), env);
    expect(me.status).toBe(401);
  });

  it('registers with a valid invite and consumes it', async () => {
    const admin = await createUser(env, { role: 'admin' });
    const now = Math.floor(Date.now() / 1000);
    await insertInvite(env.DB, { code: 'INV-OK', created_by: admin.id, used_by: null, expires_at: now + 3600, created_at: now });
    const res = await app.request(
      ...jsonRequest('/api/auth/register', 'POST', { email: 'new@test.local', password: 'pw-123456', invite: 'INV-OK' }),
      env,
    );
    expect(res.status).toBe(201);
    expect(res.headers.get('set-cookie')).toMatch(/^session=/);
    const again = await app.request(
      ...jsonRequest('/api/auth/register', 'POST', { email: 'other@test.local', password: 'pw-123456', invite: 'INV-OK' }),
      env,
    );
    expect(again.status).toBe(403);
    expect((await again.json()).error.code).toBe('invite_invalid');
  });

  it('rejects expired invites and short passwords', async () => {
    const admin = await createUser(env, { role: 'admin' });
    const now = Math.floor(Date.now() / 1000);
    await insertInvite(env.DB, { code: 'INV-OLD', created_by: admin.id, used_by: null, expires_at: now - 1, created_at: now - 100 });
    const expired = await app.request(
      ...jsonRequest('/api/auth/register', 'POST', { email: 'x@test.local', password: 'pw-123456', invite: 'INV-OLD' }),
      env,
    );
    expect(expired.status).toBe(403);
    await insertInvite(env.DB, { code: 'INV-NEW', created_by: admin.id, used_by: null, expires_at: now + 3600, created_at: now });
    const short = await app.request(
      ...jsonRequest('/api/auth/register', 'POST', { email: 'x@test.local', password: 'short', invite: 'INV-NEW' }),
      env,
    );
    expect(short.status).toBe(400);
    expect((await short.json()).error.code).toBe('validation');
  });

  it('rate limits repeated failed logins', async () => {
    const user = await createUser(env);
    let last = 0;
    for (let i = 0; i < 11; i++) {
      const res = await app.request(...jsonRequest('/api/auth/login', 'POST', { email: user.email, password: 'bad' }), env);
      last = res.status;
    }
    expect(last).toBe(429);
  });

  it('returns locale on /me, defaulting to vi', async () => {
    const { cookie } = await createUserAndLogin(env);
    const me = await app.request(...jsonRequest('/api/auth/me', 'GET', undefined, cookie), env);
    expect((await me.json()).locale).toBe('vi');
  });

  it('updates locale with PATCH /me and rejects bad values', async () => {
    const { cookie } = await createUserAndLogin(env);
    const ok = await app.request(...jsonRequest('/api/auth/me', 'PATCH', { locale: 'en' }, cookie), env);
    expect(ok.status).toBe(200);
    expect((await ok.json()).locale).toBe('en');
    const me = await app.request(...jsonRequest('/api/auth/me', 'GET', undefined, cookie), env);
    expect((await me.json()).locale).toBe('en');
    const bad = await app.request(...jsonRequest('/api/auth/me', 'PATCH', { locale: 'de' }, cookie), env);
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe('validation');
    const anon = await app.request(...jsonRequest('/api/auth/me', 'PATCH', { locale: 'en' }), env);
    expect(anon.status).toBe(401);
  });

  it('seeds the timezone without touching the locale', async () => {
    const { cookie } = await createUserAndLogin(env);
    await app.request(...jsonRequest('/api/auth/me', 'PATCH', { locale: 'en' }, cookie), env);

    // A timezone-only PATCH is what the client sends on every page load. It must
    // not carry a locale back, or it overwrites a switch made moments earlier.
    const tz = await app.request(...jsonRequest('/api/auth/me', 'PATCH', { timezone: 'Asia/Ho_Chi_Minh' }, cookie), env);
    expect(tz.status).toBe(200);
    expect((await tz.json()).locale).toBe('en');
    const me = await app.request(...jsonRequest('/api/auth/me', 'GET', undefined, cookie), env);
    expect((await me.json()).locale).toBe('en');
  });

  it('rejects a PATCH /me that changes nothing', async () => {
    const { cookie } = await createUserAndLogin(env);
    const res = await app.request(...jsonRequest('/api/auth/me', 'PATCH', {}, cookie), env);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('validation');
  });

  it('stores the locale sent at registration and falls back to vi', async () => {
    const admin = await createUser(env, { role: 'admin' });
    const now = Math.floor(Date.now() / 1000);
    await insertInvite(env.DB, { code: 'INV-EN', created_by: admin.id, used_by: null, expires_at: now + 3600, created_at: now });
    await insertInvite(env.DB, { code: 'INV-XX', created_by: admin.id, used_by: null, expires_at: now + 3600, created_at: now });
    const en = await app.request(
      ...jsonRequest('/api/auth/register', 'POST', { email: 'en@test.local', password: 'pw-123456', invite: 'INV-EN', locale: 'en' }),
      env,
    );
    expect((await en.json()).locale).toBe('en');
    const xx = await app.request(
      ...jsonRequest('/api/auth/register', 'POST', { email: 'xx@test.local', password: 'pw-123456', invite: 'INV-XX', locale: 'xx' }),
      env,
    );
    expect(xx.status).toBe(201);
    expect((await xx.json()).locale).toBe('vi');
  });

  it('creates a device named from the user agent on login', async () => {
    const user = await createUser(env);
    const res = await app.request(
      '/api/auth/login',
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        },
        body: JSON.stringify({ email: user.email, password: user.password }),
      },
      env,
    );
    expect(res.status).toBe(200);
    const rows = await listDevices(env.DB, user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe('Chrome · macOS');
  });

  it('gives each login its own device', async () => {
    const user = await createUser(env);
    await login(env, user.email, user.password);
    await login(env, user.email, user.password);
    expect(await listDevices(env.DB, user.id)).toHaveLength(2);
  });

  it('prunes devices last seen before the session TTL on login', async () => {
    const user = await createUser(env);
    const now = Math.floor(Date.now() / 1000);
    const ttl = Number(env.SESSION_TTL_SECONDS);
    await insertDevice(env.DB, { id: 'dev-old', user_id: user.id, name: 'Stale', created_at: now - ttl - 100, last_seen_at: now - ttl - 1 });
    await login(env, user.email, user.password);
    const rows = await listDevices(env.DB, user.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).not.toBe('dev-old');
  });

  it('reports the session device on the current user', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    const res = await app.request('/api/auth/me', { headers: { cookie } }, env);
    const body = (await res.json()) as UserDto;
    expect(body.deviceId).toBe(await firstDeviceId(env, user.id));
  });

  it('stores the timezone when none is set', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    const res = await app.request(...jsonRequest('/api/auth/me', 'PATCH', { locale: 'vi', timezone: 'Asia/Ho_Chi_Minh' }, cookie), env);
    expect(res.status).toBe(200);
    const row = await env.DB.prepare('select timezone from users where id = ?').bind(user.id).first<{ timezone: string }>();
    expect(row?.timezone).toBe('Asia/Ho_Chi_Minh');
  });

  it('does not overwrite a timezone that is already set', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    await app.request(...jsonRequest('/api/auth/me', 'PATCH', { locale: 'vi', timezone: 'Asia/Ho_Chi_Minh' }, cookie), env);
    await app.request(...jsonRequest('/api/auth/me', 'PATCH', { locale: 'vi', timezone: 'Europe/Berlin' }, cookie), env);
    const row = await env.DB.prepare('select timezone from users where id = ?').bind(user.id).first<{ timezone: string }>();
    expect(row?.timezone).toBe('Asia/Ho_Chi_Minh');
  });

  it('rejects a timezone the runtime does not know and leaves it unset', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    const res = await app.request(...jsonRequest('/api/auth/me', 'PATCH', { locale: 'vi', timezone: 'Mars/Olympus' }, cookie), env);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('validation');
    const row = await env.DB.prepare('select timezone from users where id = ?').bind(user.id).first<{ timezone: string }>();
    expect(row?.timezone).toBe('');
  });

  it('writes no locale when the timezone in the same request is invalid', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    const res = await app.request(...jsonRequest('/api/auth/me', 'PATCH', { locale: 'en', timezone: 'Mars/Olympus' }, cookie), env);
    expect(res.status).toBe(400);
    const row = await env.DB.prepare('select locale from users where id = ?').bind(user.id).first<{ locale: string }>();
    expect(row?.locale).toBe('vi');
  });

  it('still accepts a locale-only patch with no timezone field, and leaves a stored timezone alone', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    await app.request(...jsonRequest('/api/auth/me', 'PATCH', { locale: 'vi', timezone: 'Asia/Ho_Chi_Minh' }, cookie), env);
    const res = await app.request(...jsonRequest('/api/auth/me', 'PATCH', { locale: 'en' }, cookie), env);
    expect(res.status).toBe(200);
    const row = await env.DB.prepare('select timezone from users where id = ?').bind(user.id).first<{ timezone: string }>();
    expect(row?.timezone).toBe('Asia/Ho_Chi_Minh');
  });
});
