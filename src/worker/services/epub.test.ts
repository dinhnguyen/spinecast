import { describe, expect, it } from 'vitest';
import { EpubParseError, parseEpub } from './epub';
import { buildMinimalEpub } from '../../../test/fixtures/makeMinimalEpub';

const fixture = (): Uint8Array => buildMinimalEpub();

// Overwrites the compressed bytes of one zip entry with 0xff (an invalid deflate
// block type) while leaving every header intact, so inflating that entry throws
// but listing the archive does not.
const corruptEntryData = (zip: Uint8Array, name: string): Uint8Array => {
  const at = new TextDecoder('latin1').decode(zip).indexOf(name);
  const header = at - 30;
  const dv = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  expect(dv.getUint32(header, true)).toBe(0x04034b50);
  const compressedSize = dv.getUint32(header + 18, true);
  expect(compressedSize).toBeGreaterThan(0);
  const dataAt = header + 30 + dv.getUint16(header + 26, true) + dv.getUint16(header + 28, true);
  zip.fill(0xff, dataAt, dataAt + compressedSize);
  return zip;
};

describe('parseEpub', () => {
  it('extracts title, author and cover', () => {
    const info = parseEpub(fixture());
    expect(info.title).toBe('Minimal Book');
    expect(info.author).toBe('Test Author');
    expect(info.cover?.contentType).toBe('image/png');
    expect(info.cover?.data.length).toBeGreaterThan(10);
  });

  it('rejects a zip without epub mimetype', () => {
    const bytes = fixture();
    // corrupt the stored mimetype text at its known position inside the zip
    const text = new TextDecoder('latin1').decode(bytes);
    const at = text.indexOf('application/epub+zip');
    bytes.set(new TextEncoder().encode('application/x-broken'), at);
    expect(() => parseEpub(bytes)).toThrow(EpubParseError);
  });

  it('rejects non-zip input', () => {
    expect(() => parseEpub(new TextEncoder().encode('hello'))).toThrow(EpubParseError);
  });

  // parseEpub must never inflate an entry it does not read: an unfiltered
  // unzipSync decompresses the whole archive, which a high-ratio zip turns into
  // an OOM inside the Worker isolate. Corrupting the deflate stream of an entry
  // parseEpub has no business reading proves it is never touched: if it were
  // inflated, fflate would throw on the invalid block type.
  it('does not inflate entries it never reads', () => {
    const bytes = corruptEntryData(fixture(), 'OEBPS/c1.xhtml');
    const info = parseEpub(bytes);
    expect(info.title).toBe('Minimal Book');
    expect(info.cover?.data.length).toBeGreaterThan(10);
  });
});
