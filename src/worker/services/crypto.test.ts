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
