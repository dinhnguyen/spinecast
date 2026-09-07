import { XMLParser, XMLValidator } from 'fast-xml-parser';

export class FeedParseError extends Error {}

export interface ParsedLink {
  rel: string;
  href: string;
  type: string;
  title: string;
  content: string;
}

export interface ParsedEntry {
  id: string;
  title: string;
  author: string;
  summary: string;
  acquisition: string | null;
  coverHref: string | null;
}

export interface ParsedFeed {
  title: string;
  nav: ParsedLink[];
  entries: ParsedEntry[];
  next: string | null;
  searchTemplate: string | null;
  searchDescriptor: string | null;
}

const ACQ_REL = 'http://opds-spec.org/acquisition';
const OPEN_ACCESS_REL = 'http://opds-spec.org/acquisition/open-access';
const IMAGE_REL = 'http://opds-spec.org/image';
const THUMB_REL = 'http://opds-spec.org/image/thumbnail';
const EPUB_TYPE = 'application/epub+zip';
const DESCRIPTOR_TYPE = 'application/opensearchdescription+xml';

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@', removeNSPrefix: true, trimValues: true, parseTagValue: false, parseAttributeValue: false });

// fast-xml-parser gives a bare object for a single child and an array for
// several, so every repeated element has to be normalised before use.
const many = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? (v as Record<string, unknown>[]) : v && typeof v === 'object' ? [v as Record<string, unknown>] : []);

const text = (v: unknown): string => {
  if (typeof v === 'string') return v;
  if (v && typeof v === 'object') {
    const inner = (v as Record<string, unknown>)['#text'];
    if (typeof inner === 'string') return inner;
  }
  return '';
};

const attr = (node: Record<string, unknown>, name: string): string => {
  const v = node[`@${name}`];
  return typeof v === 'string' ? v : '';
};

const toLink = (node: Record<string, unknown>): ParsedLink => ({
  rel: attr(node, 'rel'),
  href: attr(node, 'href'),
  type: attr(node, 'type'),
  title: attr(node, 'title'),
  content: '',
});

const parseDoc = (xml: string): Record<string, unknown> => {
  if (!xml.trim()) throw new FeedParseError('empty document');
  const valid = XMLValidator.validate(xml);
  if (valid !== true) throw new FeedParseError('not well-formed xml');
  return parser.parse(xml) as Record<string, unknown>;
};

const entryFrom = (node: Record<string, unknown>): { entry: ParsedEntry | null; nav: ParsedLink | null } => {
  const links = many(node['link']).map(toLink);
  const title = text(node['title']);
  const nav = links.find((l) => l.rel === 'subsection' || l.rel === 'collection');
  if (nav && !links.some((l) => l.type === EPUB_TYPE))
    return { entry: null, nav: { ...nav, title: title || nav.title, content: text(node['content']) || text(node['summary']) } };

  const epub = links.find((l) => l.rel === ACQ_REL && l.type === EPUB_TYPE) ?? links.find((l) => l.rel === OPEN_ACCESS_REL && l.type === EPUB_TYPE);
  if (!epub) return { entry: null, nav: null };
  const cover = links.find((l) => l.rel === THUMB_REL) ?? links.find((l) => l.rel === IMAGE_REL);
  const authors = many(node['author']);
  return {
    entry: {
      id: text(node['id']),
      title,
      author: authors.length > 0 ? text(authors[0]!['name']) : '',
      summary: text(node['summary']) || text(node['content']),
      acquisition: epub.href,
      coverHref: cover ? cover.href : null,
    },
    nav: null,
  };
};

export const parseFeed = (xml: string): ParsedFeed => {
  const doc = parseDoc(xml);
  const feed = doc['feed'];
  if (!feed || typeof feed !== 'object') throw new FeedParseError('no atom feed element');
  const root = feed as Record<string, unknown>;
  const links = many(root['link']).map(toLink);
  const search = links.filter((l) => l.rel === 'search');

  const nav: ParsedLink[] = [];
  const entries: ParsedEntry[] = [];
  for (const node of many(root['entry'])) {
    const got = entryFrom(node);
    if (got.nav) nav.push(got.nav);
    if (got.entry) entries.push(got.entry);
  }

  const templated = search.find((l) => l.href.includes('{searchTerms}'));
  const descriptor = search.find((l) => l.type === DESCRIPTOR_TYPE);
  return {
    title: text(root['title']),
    nav,
    entries,
    next: links.find((l) => l.rel === 'next')?.href ?? null,
    searchTemplate: templated ? templated.href : null,
    searchDescriptor: !templated && descriptor ? descriptor.href : null,
  };
};

export const parseOpenSearch = (xml: string): string | null => {
  let doc: Record<string, unknown>;
  try {
    doc = parseDoc(xml);
  } catch {
    return null;
  }
  const desc = doc['OpenSearchDescription'];
  if (!desc || typeof desc !== 'object') return null;
  for (const url of many((desc as Record<string, unknown>)['Url'])) {
    const type = attr(url, 'type');
    const template = attr(url, 'template');
    if (type.includes('atom+xml') && template.includes('{searchTerms}')) return template;
  }
  return null;
};
