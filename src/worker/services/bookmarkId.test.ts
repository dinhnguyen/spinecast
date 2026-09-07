import { describe, expect, it } from 'vitest';
import { bookmarkIdFor } from './bookmarkId';

describe('bookmarkIdFor', () => {
  it('is 16 lowercase hex characters', async () => {
    const id = await bookmarkIdFor('/body/DocFragment[3]/body/p[12]/text().0');
    expect(id).toMatch(/^[0-9a-f]{16}$/);
  });

  it('is the first 16 hex characters of the SHA-256 of the xpath', async () => {
    // sha256("abc") = ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad
    expect(await bookmarkIdFor('abc')).toBe('ba7816bf8f01cfea');
  });

  it('is stable for the same xpath and different for another', async () => {
    const a = await bookmarkIdFor('/body/DocFragment[3]/body/p[12]/text().0');
    const again = await bookmarkIdFor('/body/DocFragment[3]/body/p[12]/text().0');
    const b = await bookmarkIdFor('/body/DocFragment[3]/body/p[13]/text().0');
    expect(a).toBe(again);
    expect(a).not.toBe(b);
  });
});
