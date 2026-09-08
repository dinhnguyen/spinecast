import { env } from 'cloudflare:workers';
import { describe, expect, it, vi } from 'vitest';
import { app } from '../app';
import { findUserById } from '../db/users';
import { insertPasskey, listPasskeys } from '../db/passkeys';
import { sha256Hex, verifyPassword } from '../services/crypto';
import { createUserAndLogin, jsonRequest } from '../../../test/helpers';

const resetBody = (body: unknown, ip = crypto.randomUUID()) => {
  const [path, init] = jsonRequest('/api/auth/reset', 'POST', body);
  return app.request(path, { ...init, headers: { ...init.headers, 'cf-connecting-ip': ip } }, env);
};
const reset = (code: string, password: unknown, ip = crypto.randomUUID()) => resetBody({ code, password }, ip);
const issue = (id: string, cookie: string) => app.request(...jsonRequest(`/api/admin/users/${id}/reset-code`, 'POST', {}, cookie), env);
const setup = async () => {
  const admin = await createUserAndLogin(env, { role: 'admin' });
  const target = await createUserAndLogin(env);
  const issued = await issue(target.user.id, admin.cookie);
  expect(issued.status).toBe(201);
  const { code } = await issued.json() as { code: string };
  return { admin, target, code, codeHash: await sha256Hex(code) };
};

 describe('password reset', () => {
  it('consumes once, changes the password, and invalidates the old session', async () => {
    const admin = await createUserAndLogin(env, { role: 'admin' });
    const b = await createUserAndLogin(env);
    const issued = await issue(b.user.id, admin.cookie);
    expect(issued.status).toBe(201);
    expect(issued.headers.get('cache-control')).toBe('no-store');
    const { code, expiresAt } = await issued.json();
    expect(code).toMatch(/^[0-9a-f]{32}$/);
    expect(expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000) + 86390);
    const success = await reset(code, 'new-password-123');
    expect(success.status).toBe(200);
    expect(success.headers.get('cache-control')).toBe('no-store');
    expect(await success.json()).toEqual({ id: b.user.id, email: b.user.email, role: 'user', locale: 'vi', deviceId: expect.any(String) });
    const freshCookie = success.headers.get('set-cookie')!.split(';')[0]!;
    expect((await app.request(...jsonRequest('/api/auth/me', 'GET', undefined, freshCookie), env)).status).toBe(200);
    expect((await app.request(...jsonRequest('/api/auth/me', 'GET', undefined, b.cookie), env)).status).toBe(401);
    const again = await reset(code, 'another-password-123');
    expect(again.status).toBe(400);
    expect((await again.json()).error.code).toBe('reset_invalid');
    const row = (await findUserById(env.DB, b.user.id))!;
    expect(await verifyPassword('new-password-123', row.password_hash)).toBe(true);
    expect(await verifyPassword(b.user.password, row.password_hash)).toBe(false);
    expect(row.session_epoch).toBe(1);
  });

  it.each([{}, { code: '' }, { code: 42 }, { code: 'unknown' }])('rejects missing or unknown code %j', async (body) => {
    const response = await resetBody({ password: 'new-password-123', ...body });
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('reset_invalid');
  });

  it.each(['short', 42, null, undefined])('rejects invalid password %j without consuming the code', async (password) => {
    const { target, code, codeHash } = await setup();
    const before = await findUserById(env.DB, target.user.id);
    const response = await reset(code, password);
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('validation');
    expect(await findUserById(env.DB, target.user.id)).toEqual(before);
    expect(await env.DB.prepare('select used_at from password_resets where code_hash = ?').bind(codeHash).first()).toEqual({ used_at: null });
  });

  it.each(['null', '[]', '1', '"text"', 'true', '{'])('rejects non-object or malformed JSON %s', async (body) => {
    const response = await app.request('/api/auth/reset', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': crypto.randomUUID() }, body }, env);
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('validation');
  });

  it.each([0, -1])('rejects expiry at now plus %i seconds without mutation', async (offset) => {
    const { target, code, codeHash } = await setup();
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare('update password_resets set expires_at = ? where code_hash = ?').bind(now + offset, codeHash).run();
    const before = await findUserById(env.DB, target.user.id);
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now * 1000);
    try {
      const response = await reset(code, 'new-password-123');
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe('reset_expired');
    } finally { clock.mockRestore(); }
    expect(await findUserById(env.DB, target.user.id)).toEqual(before);
    expect(await env.DB.prepare('select used_at from password_resets where code_hash = ?').bind(codeHash).first()).toEqual({ used_at: null });
  });

  it('invalidates the old code on reissue', async () => {
    const { admin, target, code } = await setup();
    const second = await issue(target.user.id, admin.cookie);
    expect(second.status).toBe(201);
    const rejected = await reset(code, 'new-password-123');
    expect(rejected.status).toBe(400);
    expect((await rejected.json()).error.code).toBe('reset_invalid');
    expect((await reset((await second.json()).code, 'new-password-123')).status).toBe(200);
  });

  it('leaves password, code and epoch unchanged for disabled owners', async () => {
    const { target, code, codeHash } = await setup();
    await env.DB.prepare('update users set disabled_at = ?, session_epoch = 3 where id = ?').bind(1, target.user.id).run();
    const before = await findUserById(env.DB, target.user.id);
    const response = await reset(code, 'new-password-123');
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe('account_disabled');
    expect(await findUserById(env.DB, target.user.id)).toEqual(before);
    expect(await env.DB.prepare('select used_at from password_resets where code_hash = ?').bind(codeHash).first()).toEqual({ used_at: null });
  });

  it('retains passkeys', async () => {
    const { target, code } = await setup();
    await insertPasskey(env.DB, { id: crypto.randomUUID(), user_id: target.user.id, public_key: 'key', counter: 7, transports: 'internal', name: 'Laptop', created_at: 1, last_used_at: null });
    const before = await listPasskeys(env.DB, target.user.id);
    expect((await reset(code, 'new-password-123')).status).toBe(200);
    expect(await listPasskeys(env.DB, target.user.id)).toEqual(before);
  });

  it('allows exactly one concurrent HTTP consume', async () => {
    const { target, code } = await setup();
    const passwords = ['first-password-123', 'second-password-123'];
    const responses = await Promise.all(passwords.map((password) => reset(code, password)));
    expect(responses.map((r) => r.status).sort()).toEqual([200, 400]);
    const row = (await findUserById(env.DB, target.user.id))!;
    expect(row.session_epoch).toBe(1);
    expect(await verifyPassword(passwords[responses.findIndex((r) => r.status === 200)]!, row.password_hash)).toBe(true);
  });

  it('limits attempts per IP even when codes differ', async () => {
    const ip = crypto.randomUUID();
    for (let i = 0; i < 10; i++) expect((await reset(crypto.randomUUID(), 'new-password-123', ip)).status).toBe(400);
    const response = await reset(crypto.randomUUID(), 'new-password-123', ip);
    expect(response.status).toBe(429);
    expect((await response.json()).error.code).toBe('rate_limited');
    expect((await reset(crypto.randomUUID(), 'new-password-123')).status).toBe(400);
  });
});
