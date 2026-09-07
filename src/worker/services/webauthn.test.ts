import { describe, expect, it } from 'vitest';
import { authenticationOptions, registrationOptions, rpFrom } from './webauthn';

describe('rpFrom', () => {
  it('derives the rp id and origin from the request', () => {
    expect(rpFrom('http://localhost/api/auth/passkey/options')).toEqual({ rpID: 'localhost', origin: 'http://localhost' });
    expect(rpFrom('https://spinecast.example.com/api/passkeys')).toEqual({ rpID: 'spinecast.example.com', origin: 'https://spinecast.example.com' });
    expect(rpFrom('http://localhost:5173/x')).toEqual({ rpID: 'localhost', origin: 'http://localhost:5173' });
  });
});

describe('registrationOptions', () => {
  it('requires a resident key, asks for no attestation, and excludes existing credentials', async () => {
    const existing = [{ id: 'cred-a', user_id: 'u1', public_key: 'cHVi', counter: 0, transports: 'internal,hybrid', name: 'iPhone', created_at: 1, last_used_at: null }];
    const opts = await registrationOptions({ requestUrl: 'https://host.test/x', userId: 'u1', email: 'a@b.c', existing });
    expect(opts.rp).toEqual({ id: 'host.test', name: 'Spinecast' });
    expect(opts.authenticatorSelection?.residentKey).toBe('required');
    expect(opts.authenticatorSelection?.userVerification).toBe('preferred');
    expect(opts.attestation).toBe('none');
    expect(opts.excludeCredentials).toEqual([{ id: 'cred-a', transports: ['internal', 'hybrid'], type: 'public-key' }]);
    expect(opts.user.name).toBe('a@b.c');
    expect(opts.challenge.length).toBeGreaterThan(20);
  });

  it('sends no transports for a row that has none', async () => {
    const existing = [{ id: 'cred-a', user_id: 'u1', public_key: 'cHVi', counter: 0, transports: '', name: 'Key', created_at: 1, last_used_at: null }];
    const opts = await registrationOptions({ requestUrl: 'https://host.test/x', userId: 'u1', email: 'a@b.c', existing });
    expect(opts.excludeCredentials).toEqual([{ id: 'cred-a', type: 'public-key' }]);
  });
});

describe('authenticationOptions', () => {
  it('sends an empty allowCredentials so the browser offers its discoverable passkeys', async () => {
    const opts = await authenticationOptions('https://host.test/x');
    expect(opts.rpId).toBe('host.test');
    expect(opts.allowCredentials).toEqual([]);
    expect(opts.userVerification).toBe('preferred');
  });
});
