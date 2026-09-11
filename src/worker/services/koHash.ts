import { md5Hex } from './crypto';

const CHUNK = 1024;

// Port of KOReader util.partialMD5: for i = -1..10 seek to 1024 << (2*i), read up to 1024 bytes,
// stop at the first offset at or past EOF (Lua file:read returns nil there).
//
// i = -1 is not a right shift. KOReader calls bit.lshift(1024, -2), and LuaJIT
// masks the shift count to five bits (-2 becomes 30), so 1024 << 30 overflows
// uint32 to 0 and the first chunk starts at the first byte of the file.
export const partialMd5Offsets = (size: number): number[] => {
  const offsets: number[] = [];
  for (let i = -1; i <= 10; i++) {
    const offset = i < 0 ? 0 : CHUNK << (2 * i);
    if (offset >= size) break;
    offsets.push(offset);
  }
  return offsets;
};

// Reads up to `length` bytes at `offset`. Returning fewer bytes is fine (a tail
// chunk); returning null means the source is gone and the hash cannot be built.
export type ChunkReader = (offset: number, length: number) => Promise<Uint8Array | null>;

// The offset walk lives here once: the in-memory path below and the R2 ranged-read
// path in rehashBooks must not drift apart, or a rehash would write a hash that
// ingest would never reproduce.
export const partialMd5Ranged = async (size: number, read: ChunkReader): Promise<string | null> => {
  // At most twelve reads, and the offsets do not depend on each other, so issue
  // them together: over R2 that is one round trip per book instead of twelve.
  const parts = await Promise.all(
    partialMd5Offsets(size).map((offset) => read(offset, Math.min(CHUNK, size - offset))),
  );
  if (parts.includes(null)) return null;
  const total = parts.reduce((n, p) => n + p!.length, 0);
  const joined = new Uint8Array(total);
  let pos = 0;
  for (const p of parts) {
    joined.set(p!, pos);
    pos += p!.length;
  }
  return md5Hex(joined);
};

export const partialMd5 = async (bytes: Uint8Array): Promise<string> =>
  (await partialMd5Ranged(bytes.length, (offset, length) =>
    Promise.resolve(bytes.subarray(offset, offset + length)),
  ))!;

export const filenameMd5 = (filename: string): Promise<string> => {
  const base = filename.split(/[\\/]/).pop() ?? filename;
  return md5Hex(base);
};
