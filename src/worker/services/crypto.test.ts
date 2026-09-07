import { describe, expect, it } from 'vitest';
import { decryptString, encryptString, hashPassword, md5Hex, randomHex, verifyPassword } from './crypto';

const KEY = 'dGVzdC1rZXktMzItYnl0ZXMtbG9uZy0wMDAwMDAwMDA=';

describe('crypto', () => {
  it('hashes and verifies a password', async () => {
    const stored = await hashPassword('correct horse');
    expect(stored.startsWith('pbkdf2$100000$')).toBe(true);
    expect(await verifyPassword('correct horse', stored)).toBe(true);
    expect(await verifyPassword('wrong', stored)).toBe(false);
  });

  it('computes md5 like KOReader does for the auth key', async () => {
    expect(await md5Hex('')).toBe('d41d8cd98f00b204e9800998ecf8427e');
    expect(await md5Hex('Foundryside - Robert Jackson Bennett.epub')).toBe('25f8abb4f4f5594f02f361726814fea1');
  });

  it('round-trips aes-gcm', async () => {
    const sealed = await encryptString('0f359740bd1cda994f8b55330c86d845', KEY);
    expect(sealed).not.toContain('0f359740');
    expect(await decryptString(sealed, KEY)).toBe('0f359740bd1cda994f8b55330c86d845');
  });

  it('makes random hex of the requested length', () => {
    expect(randomHex(16)).toMatch(/^[0-9a-f]{32}$/);
    expect(randomHex(4)).not.toBe(randomHex(4));
  });

  it('returns false instead of throwing on a malformed stored hash', async () => {
    await expect(verifyPassword('anything', 'pbkdf2$abc$AAAA$BBBB')).resolves.toBe(false);
    await expect(verifyPassword('anything', 'pbkdf2$100000$not-valid-base64!!!$BBBB')).resolves.toBe(false);
    await expect(verifyPassword('anything', 'not-even-the-right-shape')).resolves.toBe(false);
  });
});

describe('SYNC_ENC_KEY validation', () => {
  it('names the missing key rather than failing as a base64 error', async () => {
    // What production actually did: the secret was never set, so the key arrived
    // as undefined and the request died with a DOMException.
    await expect(encryptString('x', undefined as unknown as string)).rejects.toThrow(/SYNC_ENC_KEY/);
    await expect(encryptString('x', '')).rejects.toThrow(/32 bytes/);
    await expect(encryptString('x', 'not base64!!')).rejects.toThrow(/SYNC_ENC_KEY/);
    await expect(encryptString('x', btoa('too-short'))).rejects.toThrow(/32 bytes, got 9/);
  });
});
