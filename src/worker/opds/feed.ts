export const NAV_TYPE = 'application/atom+xml;profile=opds-catalog;kind=navigation';
export const ACQ_TYPE = 'application/atom+xml;profile=opds-catalog;kind=acquisition';
export const OPENSEARCH_TYPE = 'application/opensearchdescription+xml';

export const escapeXml = (s: string): string =>
  s.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[ch]!);

export const rfc3339 = (ts: number): string => new Date(ts * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');

export interface NavEntry {
  id: string;
  title: string;
  href: string;
  content: string;
}

export interface BookEntry {
  id: string;
  title: string;
  author: string;
  updated: number;
  epubHref: string;
  coverHref: string | null;
  coverType: string | null;
}

export interface FeedBase {
  id: string;
  title: string;
  self: string;
  start: string;
  updated: number;
}

const link = (rel: string, href: string, type: string): string =>
  `<link rel="${escapeXml(rel)}" href="${escapeXml(href)}" type="${escapeXml(type)}"/>`;

const head = (base: FeedBase, selfType: string): string =>
  `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:opds="http://opds-spec.org/2010/catalog">
<id>${escapeXml(base.id)}</id>
<title>${escapeXml(base.title)}</title>
<updated>${rfc3339(base.updated)}</updated>
${link('self', base.self, selfType)}
${link('start', base.start, NAV_TYPE)}
`;

export const navigationFeed = (opts: FeedBase & { searchHref: string; entries: NavEntry[] }): string => {
  const entries = opts.entries
    .map(
      (e) => `<entry>
<id>${escapeXml(e.id)}</id>
<title>${escapeXml(e.title)}</title>
<updated>${rfc3339(opts.updated)}</updated>
${link('subsection', e.href, ACQ_TYPE)}
<content type="text">${escapeXml(e.content)}</content>
</entry>
`,
    )
    .join('');
  return `${head(opts, NAV_TYPE)}${link('search', opts.searchHref, OPENSEARCH_TYPE)}
${entries}</feed>
`;
};

export const acquisitionFeed = (opts: FeedBase & { next: string | null; entries: BookEntry[] }): string => {
  const entries = opts.entries
    .map((e) => {
      const cover =
        e.coverHref && e.coverType
          ? `${link('http://opds-spec.org/image', e.coverHref, e.coverType)}
${link('http://opds-spec.org/image/thumbnail', e.coverHref, e.coverType)}
`
          : '';
      return `<entry>
<id>${escapeXml(e.id)}</id>
<title>${escapeXml(e.title)}</title>
<author><name>${escapeXml(e.author)}</name></author>
<updated>${rfc3339(e.updated)}</updated>
${link('http://opds-spec.org/acquisition', e.epubHref, 'application/epub+zip')}
${cover}</entry>
`;
    })
    .join('');
  const next = opts.next ? `${link('next', opts.next, ACQ_TYPE)}\n` : '';
  return `${head(opts, ACQ_TYPE)}${next}${entries}</feed>
`;
};

export const openSearchDescription = (template: string): string => `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
<ShortName>Spinecast</ShortName>
<Description>Search books by title or author</Description>
<InputEncoding>UTF-8</InputEncoding>
<Url type="${ACQ_TYPE}" template="${escapeXml(template)}"/>
</OpenSearchDescription>
`;
