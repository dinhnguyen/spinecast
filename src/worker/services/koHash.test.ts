import { describe, expect, it } from 'vitest';
import { filenameMd5, partialMd5 } from './koHash';

const pattern = (n: number): Uint8Array => Uint8Array.from({ length: n }, (_, i) => (i * 7 + 13) & 0xff);

// This pattern repeats every 256 bytes, which is exactly the offset the i = -1
// chunk used to be read from, so it cannot tell offset 0 from offset 256 on a
// file long enough to reach the second chunk. Hence `drifting` below.
const drifting = (n: number): Uint8Array => {
  const out = new Uint8Array(n);
  let x = 0x12345678;
  for (let i = 0; i < n; i++) {
    x = (Math.imul(1103515245, x) + 12345) >>> 0;
    out[i] = (x >>> 16) & 0xff;
  }
  return out;
};

describe('koHash', () => {
  it('matches KOReader partialMD5 on a 300000-byte file', async () => {
    expect(await partialMd5(pattern(300_000))).toBe('963e6f1bff19c68e01111435410e4b99');
  });

  it('reads a short tail chunk then stops at EOF (500 bytes)', async () => {
    expect(await partialMd5(pattern(500))).toBe('3710b35a9f85961ec5d30c618a213fd4');
  });

  // KOReader's i = -1 seeks to bit.lshift(1024, -2), which LuaJIT masks to a
  // shift of 30 and truncates to 0 - so the first chunk starts at the first
  // byte, and a file shorter than one chunk still hashes what it has.
  it('starts the first chunk at offset 0, so a 200-byte file hashes its 200 bytes', async () => {
    expect(await partialMd5(pattern(200))).toBe('d3d8bdf77ec70c2d8b26a75c817eeadc');
  });

  it('starts at offset 0 on content that does not repeat every 256 bytes', async () => {
    expect(await partialMd5(drifting(500))).toBe('fd7ce56c78c4d9ee64ff2b89d1ad211b');
    expect(await partialMd5(drifting(5000))).toBe('c934d4ea598ce1333975ed286763ac97');
  });

  it('hashes the basename for the filename method', async () => {
    expect(await filenameMd5('Foundryside - Robert Jackson Bennett.epub')).toBe('25f8abb4f4f5594f02f361726814fea1');
    expect(await filenameMd5('/sdcard/Books/Foundryside - Robert Jackson Bennett.epub')).toBe('25f8abb4f4f5594f02f361726814fea1');
  });
});
