import { describe, expect, it } from 'vitest';
import { generateOpdsToken, hashOpdsToken, OPDS_TOKEN_LENGTH } from './opdsToken';

describe('opds token', () => {
  it('generates 6 lowercase base32 characters', () => {
    for (let i = 0; i < 50; i++) {
      const t = generateOpdsToken();
      expect(t).toHaveLength(OPDS_TOKEN_LENGTH);
      expect(t).toMatch(/^[a-z2-7]{6}$/);
    }
  });

  it('generates distinct tokens', () => {
    expect(generateOpdsToken()).not.toBe(generateOpdsToken());
  });

  it('hashes with sha-256 hex', async () => {
    expect(await hashOpdsToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
