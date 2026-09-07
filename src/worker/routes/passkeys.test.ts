import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { app } from '../app';
import { rpFrom } from '../services/webauthn';
import { createMockAuthenticator } from '../../../test/mockAuthenticator';
import { createUserAndLogin, jsonRequest } from '../../../test/helpers';

const PASSWORD = 'secret-pass-1';

const enrol = async (cookie: string, name?: string) => {
  const auth = await createMockAuthenticator();
  const started = await app.request(...jsonRequest('/api/passkeys/register/options', 'POST', { password: PASSWORD }, cookie), env);
  const { challengeId, options } = await started.json();
  const rp = rpFrom('http://localhost/api/passkeys');
  const response = await auth.register({ ...rp, challenge: options.challenge });
  const verified = await app.request(...jsonRequest('/api/passkeys/register/verify', 'POST', { challengeId, credential: response, name }, cookie), env);
  return { auth, started, verified, challengeId, options, response };
};

describe('passkey management', () => {
  it('enrols a passkey after the password step-up and lists it', async () => {
    const { cookie } = await createUserAndLogin(env, { password: PASSWORD });
    const { auth, verified } = await enrol(cookie);
    expect(verified.status).toBe(201);
    const dto = await verified.json();
    expect(dto.id).toBe(auth.credentialId);
    expect(dto.name.length).toBeGreaterThan(0);
    expect(dto.lastUsedAt).toBeNull();

    const listed = await (await app.request(...jsonRequest('/api/passkeys', 'GET', undefined, cookie), env)).json();
    expect(listed.items.map((p: { id: string }) => p.id)).toEqual([auth.credentialId]);
    expect(JSON.stringify(listed)).not.toContain('public_key');
  });

  it('takes an explicit name and otherwise derives one from the user agent', async () => {
    const { cookie } = await createUserAndLogin(env, { password: PASSWORD });
    const named = await enrol(cookie, '  MacBook cũ  ');
    expect((await named.verified.json()).name).toBe('MacBook cũ');
    const blank = await enrol(cookie, '   ');
    expect((await blank.verified.json()).name.length).toBeGreaterThan(0);
  });

  it('refuses the wrong password at the step-up', async () => {
    const { cookie } = await createUserAndLogin(env, { password: PASSWORD });
    const res = await app.request(...jsonRequest('/api/passkeys/register/options', 'POST', { password: 'wrong-pass-9' }, cookie), env);
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe('invalid_credentials');
  });

  it('excludes credentials already enrolled', async () => {
    const { cookie } = await createUserAndLogin(env, { password: PASSWORD });
    const { auth } = await enrol(cookie);
    const again = await app.request(...jsonRequest('/api/passkeys/register/options', 'POST', { password: PASSWORD }, cookie), env);
    const { options } = await again.json();
    expect(options.excludeCredentials).toEqual([{ id: auth.credentialId, transports: ['internal'], type: 'public-key' }]);
  });

  it('rejects a reused challenge', async () => {
    const { cookie } = await createUserAndLogin(env, { password: PASSWORD });
    const { challengeId, response } = await enrol(cookie);
    const replay = await app.request(...jsonRequest('/api/passkeys/register/verify', 'POST', { challengeId, credential: response }, cookie), env);
    expect(replay.status).toBe(400);
    expect((await replay.json()).error.code).toBe('challenge_expired');
  });

  it('refuses to move a credential already registered to another account', async () => {
    const first = await createUserAndLogin(env, { password: PASSWORD });
    const other = await createUserAndLogin(env, { password: PASSWORD });
    const { auth } = await enrol(first.cookie);

    // The same authenticator, so the same credential id, answering the second
    // user's own fresh challenge: the ceremony verifies, the insert must not.
    const started = await (await app.request(...jsonRequest('/api/passkeys/register/options', 'POST', { password: PASSWORD }, other.cookie), env)).json();
    const rp = rpFrom('http://localhost/api/passkeys');
    const credential = await auth.register({ ...rp, challenge: started.options.challenge });
    const stolen = await app.request(...jsonRequest('/api/passkeys/register/verify', 'POST', { challengeId: started.challengeId, credential }, other.cookie), env);
    expect(stolen.status).toBe(409);
    expect((await stolen.json()).error.code).toBe('duplicate');
    expect((await (await app.request(...jsonRequest('/api/passkeys', 'GET', undefined, other.cookie), env)).json()).items).toEqual([]);
    expect((await (await app.request(...jsonRequest('/api/passkeys', 'GET', undefined, first.cookie), env)).json()).items).toHaveLength(1);
  });

  it('renames and deletes only your own passkey, and validates the name', async () => {
    const mine = await createUserAndLogin(env, { password: PASSWORD });
    const other = await createUserAndLogin(env, { password: PASSWORD });
    const { auth } = await enrol(mine.cookie);

    expect((await app.request(...jsonRequest(`/api/passkeys/${auth.credentialId}`, 'PATCH', { name: 'Stolen' }, other.cookie), env)).status).toBe(404);
    expect((await app.request(...jsonRequest(`/api/passkeys/${auth.credentialId}`, 'DELETE', undefined, other.cookie), env)).status).toBe(404);
    expect((await app.request(...jsonRequest(`/api/passkeys/${auth.credentialId}`, 'PATCH', { name: '   ' }, mine.cookie), env)).status).toBe(400);

    const renamed = await app.request(...jsonRequest(`/api/passkeys/${auth.credentialId}`, 'PATCH', { name: 'iPhone 15' }, mine.cookie), env);
    expect((await renamed.json()).name).toBe('iPhone 15');
    expect((await app.request(...jsonRequest(`/api/passkeys/${auth.credentialId}`, 'DELETE', undefined, mine.cookie), env)).status).toBe(204);
    expect((await (await app.request(...jsonRequest('/api/passkeys', 'GET', undefined, mine.cookie), env)).json()).items).toEqual([]);
  });

  it('requires a session', async () => {
    expect((await app.request(...jsonRequest('/api/passkeys', 'GET'), env)).status).toBe(401);
    expect((await app.request(...jsonRequest('/api/passkeys/register/options', 'POST', { password: PASSWORD }), env)).status).toBe(401);
  });
});
