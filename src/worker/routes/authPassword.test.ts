import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { app } from '../app';
import { insertPasskey, listPasskeys } from '../db/passkeys';
import { findUserById } from '../db/users';
import { verifyPassword } from '../services/crypto';
import { createUserAndLogin, jsonRequest, login } from '../../../test/helpers';

const change = (cookie: string, body: unknown) =>
  app.request(...jsonRequest('/api/auth/password', 'POST', body, cookie), env);

describe('change password', () => {
  it('requires a session', async () => {
    expect((await app.request(...jsonRequest('/api/auth/password', 'POST', { current: 'x', password: 'y', signOutOthers: false }), env)).status).toBe(401);
  });

  it('rejects a wrong current password without touching hash or epoch', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    const before = (await findUserById(env.DB, user.id))!;
    const res = await change(cookie, { current: 'not-it-12345', password: 'brand-new-pass-1', signOutOthers: true });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('invalid_credentials');
    const after = (await findUserById(env.DB, user.id))!;
    expect(after.password_hash).toBe(before.password_hash);
    expect(after.session_epoch).toBe(before.session_epoch);
  });

  it('rejects a short new password', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    const res = await change(cookie, { current: user.password, password: 'short', signOutOthers: false });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('validation');
  });

  it('with signOutOthers bumps the epoch, kills the old cookie, and issues a working new one', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    const other = await login(env, user.email, user.password);
    const res = await change(cookie, { current: user.password, password: 'brand-new-pass-1', signOutOthers: true });
    expect(res.status).toBe(200);
    expect((await res.json()).id).toBe(user.id);
    const fresh = res.headers.get('set-cookie')!.split(';')[0]!;
    expect((await app.request(...jsonRequest('/api/auth/me', 'GET', undefined, fresh), env)).status).toBe(200);
    expect((await app.request(...jsonRequest('/api/auth/me', 'GET', undefined, other), env)).status).toBe(401);
    const row = (await findUserById(env.DB, user.id))!;
    expect(row.session_epoch).toBe(1);
    expect(await verifyPassword('brand-new-pass-1', row.password_hash)).toBe(true);
    expect(await verifyPassword(user.password, row.password_hash)).toBe(false);
  });

  it('without signOutOthers changes the hash only and leaves other sessions alive', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    const other = await login(env, user.email, user.password);
    const res = await change(cookie, { current: user.password, password: 'brand-new-pass-2', signOutOthers: false });
    expect(res.status).toBe(200);
    expect((await app.request(...jsonRequest('/api/auth/me', 'GET', undefined, other), env)).status).toBe(200);
    expect((await findUserById(env.DB, user.id))!.session_epoch).toBe(0);
    expect(await login(env, user.email, 'brand-new-pass-2')).toMatch(/^session=/);
  });

  it('does not touch passkeys', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    const passkeyId = crypto.randomUUID();
    await insertPasskey(env.DB, {
      id: passkeyId,
      user_id: user.id,
      public_key: 'pk',
      counter: 0,
      transports: '[]',
      name: 'Laptop',
      created_at: 1,
      last_used_at: null,
    });
    await change(cookie, { current: user.password, password: 'brand-new-pass-3', signOutOthers: true });
    const after = await listPasskeys(env.DB, user.id);
    expect(after.map((row) => row.id)).toEqual([passkeyId]);
  });

  it('rate limits wrong attempts per user', async () => {
    const { cookie } = await createUserAndLogin(env);
    for (let attempt = 0; attempt < 10; attempt++) {
      expect((await change(cookie, { current: `wrong-${attempt}-xxxxx`, password: 'brand-new-pass-4', signOutOthers: false })).status).toBe(400);
    }
    expect((await change(cookie, { current: 'wrong-again-xxx', password: 'brand-new-pass-4', signOutOthers: false })).status).toBe(429);
  });

  it('does not rate limit repeated successful changes', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    let current = user.password;
    for (let attempt = 0; attempt < 10; attempt++) {
      const password = `brand-new-pass-${attempt}-ok`;
      const res = await change(cookie, { current, password, signOutOthers: false });
      expect(res.status).toBe(200);
      current = password;
    }
  });
});
