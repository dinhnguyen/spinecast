import { strFromU8, unzipSync } from 'fflate';

export class EpubParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EpubParseError';
  }
}

export interface EpubCover {
  data: Uint8Array;
  contentType: string;
}

export interface EpubInfo {
  title: string;
  author: string;
  cover: EpubCover | null;
}

const attr = (tag: string, name: string): string | null => {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`)) ?? tag.match(new RegExp(`${name}\\s*=\\s*'([^']*)'`));
  return m?.[1] ?? null;
};

const textOf = (xml: string, localName: string): string | null => {
  const m = xml.match(new RegExp(`<(?:[\\w-]+:)?${localName}(?:\\s[^>]*)?>([^<]*)</(?:[\\w-]+:)?${localName}>`));
  return m?.[1]?.trim() ?? null;
};

const decodeEntities = (s: string): string =>
  s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");

const dirname = (p: string): string => (p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '');

const resolvePath = (base: string, href: string): string => {
  const parts = (dirname(base) + href).split('/');
  const out: string[] = [];
  for (const part of parts) {
    if (part === '..') out.pop();
    else if (part !== '.' && part !== '') out.push(part);
  }
  return out.join('/');
};

// Only four entries are ever read out of an EPUB here (mimetype, container.xml,
// the OPF and the cover image), and each name is known only after the previous
// entry has been parsed. An unfiltered unzipSync would inflate the entire
// archive: with the 100MB upload cap, that plus the KOReader hash buffers can
// exhaust a Worker isolate, and a deliberately high-compression-ratio zip makes
// it a trivial DoS. So every pass inflates exactly the entries it needs.
const extractEntries = (bytes: Uint8Array, wanted: string[]): Record<string, Uint8Array> => {
  const names = new Set(wanted);
  try {
    return unzipSync(bytes, { filter: (file) => names.has(file.name) });
  } catch {
    throw new EpubParseError('corrupt zip file');
  }
};

export const parseEpub = (bytes: Uint8Array): EpubInfo => {
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new EpubParseError('not a zip file');
  const head = extractEntries(bytes, ['mimetype', 'META-INF/container.xml']);
  const mimetype = head['mimetype'] ? strFromU8(head['mimetype']).trim() : '';
  if (mimetype !== 'application/epub+zip') throw new EpubParseError('not an epub file');
  const container = head['META-INF/container.xml'];
  if (!container) throw new EpubParseError('missing container.xml');
  const rootfileTag = strFromU8(container).match(/<rootfile\b[^>]*>/)?.[0] ?? '';
  const opfPath = attr(rootfileTag, 'full-path');
  const opfBytes = opfPath ? extractEntries(bytes, [opfPath])[opfPath] : undefined;
  if (!opfPath || !opfBytes) throw new EpubParseError('missing opf file');
  const opf = strFromU8(opfBytes);

  const title = decodeEntities(textOf(opf, 'title') ?? '') || 'Untitled';
  const author = decodeEntities(textOf(opf, 'creator') ?? '');

  const items = [...opf.matchAll(/<item\b[^>]*>/g)].map((m) => m[0]);
  const byId = new Map(items.map((t) => [attr(t, 'id') ?? '', t]));
  const coverItem =
    items.find((t) => (attr(t, 'properties') ?? '').split(/\s+/).includes('cover-image')) ??
    (() => {
      const metaTag = [...opf.matchAll(/<meta\b[^>]*>/g)].map((m) => m[0]).find((t) => attr(t, 'name') === 'cover');
      const id = metaTag ? attr(metaTag, 'content') : null;
      return id ? byId.get(id) : undefined;
    })();

  let cover: EpubCover | null = null;
  if (coverItem) {
    const href = attr(coverItem, 'href');
    const contentType = attr(coverItem, 'media-type') ?? 'image/jpeg';
    const path = href && contentType.startsWith('image/') ? resolvePath(opfPath, decodeEntities(href)) : null;
    const data = path ? extractEntries(bytes, [path])[path] : undefined;
    if (data) cover = { data, contentType };
  }
  return { title, author, cover };
};
