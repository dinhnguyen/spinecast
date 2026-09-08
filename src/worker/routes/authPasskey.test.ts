import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { app } from '../app';
import { findPasskeyById } from '../db/passkeys';
import { listDevices } from '../db/devices';
import { rpFrom } from '../services/webauthn';
import { createMockAuthenticator } from '../../../test/mockAuthenticator';
import { createUserAndLogin, jsonRequest } from '../../../test/helpers';

const PASSWORD = 'secret-pass-1';
const RP = rpFrom('http://localhost/api/auth/passkey/options');

const enrol = async (cookie: string) => {
  const auth = await createMockAuthenticator();
  const started = await (await app.request(...jsonRequest('/api/passkeys/register/options', 'POST', { password: PASSWORD }, cookie), env)).json();
  const credential = await auth.register({ ...RP, challenge: started.options.challenge });
  await app.request(...jsonRequest('/api/passkeys/register/verify', 'POST', { challengeId: started.challengeId, credential }, cookie), env);
  return auth;
};

const loginWith = async (auth: Awaited<ReturnType<typeof createMockAuthenticator>>, counter = 0, ip = 'local') => {
  const headers = { 'cf-connecting-ip': ip };
  const started = await (await app.request('/api/auth/passkey/options', { method: 'POST', headers, body: '{}' }, env)).json();
  const credential = await auth.assert({ ...RP, challenge: started.options.challenge, counter });
  const res = await app.request(
    '/api/auth/passkey/verify',
    { method: 'POST', headers, body: JSON.stringify({ challengeId: started.challengeId, credential }) },
    env,
  );
  return { res, challengeId: started.challengeId, credential };
};

describe('passkey login', () => {
  it('signs in with no email typed and mints a device like a password login', async () => {
    const { user, cookie } = await createUserAndLogin(env, { password: PASSWORD });
    const auth = await enrol(cookie);
    const before = (await listDevices(env.DB, user.id)).length;

    const { res } = await loginWith(auth);
    expect(res.status).toBe(200);
    const dto = await res.json();
    expect(dto.id).toBe(user.id);
    expect(dto.email).toBe(user.email);
    expect(dto.deviceId).toMatch(/^dev-/);
    expect(res.headers.get('set-cookie')).toContain('session=');
    expect((await listDevices(env.DB, user.id)).length).toBe(before + 1);

    const sessionCookie = res.headers.get('set-cookie')!.split(';')[0]!;
    const me = await app.request(...jsonRequest('/api/auth/me', 'GET', undefined, sessionCookie), env);
    expect((await me.json()).id).toBe(user.id);
  });

  it('rejects a disabled passkey owner without setting a cookie', async () => {
    const { user, cookie } = await createUserAndLogin(env, { password: PASSWORD });
    const auth = await enrol(cookie);
    await env.DB.prepare('update users set disabled_at = 1 where id = ?').bind(user.id).run();
    const { res } = await loginWith(auth, 0, '198.51.100.10');
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe('account_disabled');
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  it('records the counter and the last use', async () => {
    const { cookie } = await createUserAndLogin(env, { password: PASSWORD });
    const auth = await enrol(cookie);
    await loginWith(auth, 3);
    const row = (await findPasskeyById(env.DB, auth.credentialId))!;
    expect(row.counter).toBe(3);
    expect(row.last_used_at).toBeGreaterThan(0);
  });

  it('accepts a stored zero counter repeatedly, the way iCloud Keychain behaves', async () => {
    const { cookie } = await createUserAndLogin(env, { password: PASSWORD });
    const auth = await enrol(cookie);
    expect((await loginWith(auth, 0)).res.status).toBe(200);
    expect((await loginWith(auth, 0)).res.status).toBe(200);
  });

  it('rejects a regressed counter', async () => {
    const { cookie } = await createUserAndLogin(env, { password: PASSWORD });
    const auth = await enrol(cookie);
    expect((await loginWith(auth, 5)).res.status).toBe(200);
    const late = await loginWith(auth, 4);
    expect(late.res.status).toBe(401);
    expect((await late.res.json()).error.code).toBe('invalid_credentials');
  });

  it('rejects a replayed challenge', async () => {
    const { cookie } = await createUserAndLogin(env, { password: PASSWORD });
    const auth = await enrol(cookie);
    const { challengeId, credential } = await loginWith(auth);
    const replay = await app.request(...jsonRequest('/api/auth/passkey/verify', 'POST', { challengeId, credential }), env);
    expect(replay.status).toBe(400);
    expect((await replay.json()).error.code).toBe('challenge_expired');
  });

  it('answers the same 401 for an unknown credential as for a bad signature', async () => {
    const stranger = await createMockAuthenticator();
    const unknown = await loginWith(stranger);
    expect(unknown.res.status).toBe(401);
    expect((await unknown.res.json()).error.code).toBe('invalid_credentials');

    const { cookie } = await createUserAndLogin(env, { password: PASSWORD });
    const auth = await enrol(cookie);
    const started = await (await app.request(...jsonRequest('/api/auth/passkey/options', 'POST', {}), env)).json();
    const credential = await auth.assert({ ...RP, challenge: started.options.challenge, counter: 0 });
    const tampered = { ...credential, response: { ...credential.response, signature: credential.response.signature.slice(0, -4) + 'AAAA' } };
    const bad = await app.request(...jsonRequest('/api/auth/passkey/verify', 'POST', { challengeId: started.challengeId, credential: tampered }), env);
    expect(bad.status).toBe(401);
    expect((await bad.json()).error.code).toBe('invalid_credentials');
  });

  it('returns options without a session', async () => {
    const res = await app.request(...jsonRequest('/api/auth/passkey/options', 'POST', {}), env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.options.allowCredentials).toEqual([]);
    expect(body.challengeId).toMatch(/^[0-9a-f]{32}$/);
  });
});
