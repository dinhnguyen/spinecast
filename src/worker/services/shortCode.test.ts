import { describe, expect, it } from 'vitest';
import { makeShortCode } from './shortCode';

describe('makeShortCode', () => {
  it('retains the invite alphabet and format across 100 samples', () => {
    for (let i = 0; i < 100; i++) {
      const code = makeShortCode();
      expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{4}$/);
      expect(code).not.toMatch(/[01IO]/);
    }
  });
});
