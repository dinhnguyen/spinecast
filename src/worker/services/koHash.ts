import { md5Hex } from './crypto';

const CHUNK = 1024;

// Port of KOReader util.partialMD5: for i = -1..10 seek to 1024 << (2*i), read up to 1024 bytes,
// stop at the first offset at or past EOF (Lua file:read returns nil there).
export const partialMd5 = async (bytes: Uint8Array): Promise<string> => {
  const parts: Uint8Array[] = [];
  let total = 0;
  for (let i = -1; i <= 10; i++) {
    const offset = i < 0 ? CHUNK >> (-2 * i) : CHUNK << (2 * i);
    if (offset >= bytes.length) break;
    const part = bytes.subarray(offset, Math.min(offset + CHUNK, bytes.length));
    parts.push(part);
    total += part.length;
  }
  const joined = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) {
    joined.set(p, pos);
    pos += p.length;
  }
  return md5Hex(joined);
};

export const filenameMd5 = (filename: string): Promise<string> => {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  return md5Hex(base);
};
