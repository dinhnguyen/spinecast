import { describe, expect, it } from 'vitest';
import { createMockAuthenticator } from '../../../test/mockAuthenticator';
import { authenticationOptions, registrationOptions, verifyAuthentication, verifyRegistration } from './webauthn';

const REQUEST_URL = 'https://host.test/api/passkeys';
const RP = { rpID: 'host.test', origin: 'https://host.test' };

const row = (id: string, publicKey: string, counter: number) => ({
  id,
  user_id: 'u1',
  public_key: publicKey,
  counter,
  transports: 'internal',
  name: 'Mock',
  created_at: 1,
  last_used_at: null,
});

describe('mock authenticator', () => {
  it('produces a registration response the library verifies', async () => {
    const auth = await createMockAuthenticator();
    const opts = await registrationOptions({ requestUrl: REQUEST_URL, userId: 'u1', email: 'a@b.c', existing: [] });
    const response = await auth.register({ ...RP, challenge: opts.challenge });
    const cred = await verifyRegistration({ requestUrl: REQUEST_URL, expectedChallenge: opts.challenge, response });
    expect(cred.id).toBe(auth.credentialId);
    expect(cred.publicKey).toBe(auth.publicKeyB64);
    expect(cred.counter).toBe(0);
    expect(cred.transports).toBe('internal');
  });

  it('produces an assertion the library verifies, and a stored-zero counter is fine', async () => {
    const auth = await createMockAuthenticator();
    const opts = await authenticationOptions(REQUEST_URL);
    const response = await auth.assert({ ...RP, challenge: opts.challenge, counter: 0 });
    const newCounter = await verifyAuthentication({ requestUrl: REQUEST_URL, expectedChallenge: opts.challenge, response, row: row(auth.credentialId, auth.publicKeyB64, 0) });
    expect(newCounter).toBe(0);
  });

  it('is rejected when the counter regresses', async () => {
    const auth = await createMockAuthenticator();
    const opts = await authenticationOptions(REQUEST_URL);
    const response = await auth.assert({ ...RP, challenge: opts.challenge, counter: 4 });
    await expect(
      verifyAuthentication({ requestUrl: REQUEST_URL, expectedChallenge: opts.challenge, response, row: row(auth.credentialId, auth.publicKeyB64, 5) }),
    ).rejects.toThrow();
  });

  it('is rejected on the wrong origin and on a tampered signature', async () => {
    const auth = await createMockAuthenticator();
    const opts = await authenticationOptions(REQUEST_URL);
    const wrongOrigin = await auth.assert({ rpID: 'host.test', origin: 'https://evil.test', challenge: opts.challenge, counter: 0 });
    await expect(
      verifyAuthentication({ requestUrl: REQUEST_URL, expectedChallenge: opts.challenge, response: wrongOrigin, row: row(auth.credentialId, auth.publicKeyB64, 0) }),
    ).rejects.toThrow();

    const other = await createMockAuthenticator();
    const mismatched = await auth.assert({ ...RP, challenge: opts.challenge, counter: 0 });
    await expect(
      verifyAuthentication({ requestUrl: REQUEST_URL, expectedChallenge: opts.challenge, response: mismatched, row: row(auth.credentialId, other.publicKeyB64, 0) }),
    ).rejects.toThrow();
  });
});
