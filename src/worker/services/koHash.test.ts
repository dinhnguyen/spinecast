import { describe, expect, it } from 'vitest';
import { filenameMd5, partialMd5 } from './koHash';

const pattern = (n: number): Uint8Array => Uint8Array.from({ length: n }, (_, i) => (i * 7 + 13) & 0xff);

describe('koHash', () => {
  it('matches KOReader partialMD5 on a 300000-byte file', async () => {
    expect(await partialMd5(pattern(300_000))).toBe('963e6f1bff19c68e01111435410e4b99');
  });

  it('reads a short tail chunk then stops at EOF (500 bytes)', async () => {
    expect(await partialMd5(pattern(500))).toBe('813b84da62541c070af98e0533c8377b');
  });

  it('hashes nothing when the file is shorter than 257 bytes', async () => {
    expect(await partialMd5(pattern(200))).toBe('d41d8cd98f00b204e9800998ecf8427e');
  });

  it('hashes the basename for the filename method', async () => {
    expect(await filenameMd5('Foundryside - Robert Jackson Bennett.epub')).toBe('25f8abb4f4f5594f02f361726814fea1');
    expect(await filenameMd5('/sdcard/Books/Foundryside - Robert Jackson Bennett.epub')).toBe('25f8abb4f4f5594f02f361726814fea1');
  });
});
