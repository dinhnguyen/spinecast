import { describe, expect, it } from 'vitest';
import { sha256Hex } from './crypto';
import { clippingIdFor, HIGHLIGHT_COLORS } from './clippingId';

describe('clippingIdFor', () => {
  it('is 16 lowercase hex characters', async () => {
    expect(await clippingIdFor(1752300000, 'some text')).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is the first 16 hex characters of the SHA-256 of created_at then text, in that order', async () => {
    expect(await clippingIdFor(12, 'ab')).toBe((await sha256Hex('12ab')).slice(0, 16));
  });

  it('is stable for the same inputs and differs when either changes', async () => {
    const base = await clippingIdFor(1752300000, 'some text');
    expect(await clippingIdFor(1752300000, 'some text')).toBe(base);
    expect(await clippingIdFor(1752300001, 'some text')).not.toBe(base);
    expect(await clippingIdFor(1752300000, 'other text')).not.toBe(base);
  });
});

describe('HIGHLIGHT_COLORS', () => {
  it('is the four mockup colours in lowercase hex', () => {
    expect(HIGHLIGHT_COLORS).toEqual(['#f4e3a1', '#cfe3b8', '#f3c9b8', '#cbdcf0']);
  });
});
