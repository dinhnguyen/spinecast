import { describe, expect, it } from 'vitest';
import { acquisitionFeed, escapeXml, navigationFeed, openSearchDescription, rfc3339 } from './feed';

const base = { id: 'urn:spinecast:u1:library', title: 'Thư viện', self: 'https://h/opds/u1/library/all?page=1', start: 'https://h/opds/u1/library', updated: 1_700_000_000 };

describe('escapeXml', () => {
  it('escapes the five special characters', () => {
    expect(escapeXml(`a & b < c > d " e ' f`)).toBe('a &amp; b &lt; c &gt; d &quot; e &apos; f');
  });
});

describe('rfc3339', () => {
  it('formats unix seconds in utc', () => {
    expect(rfc3339(1_700_000_000)).toBe('2023-11-14T22:13:20Z');
  });
});

describe('navigationFeed', () => {
  it('emits nav entries and a search link', () => {
    const xml = navigationFeed({ ...base, searchHref: 'https://h/opds/u1/library/opensearch.xml', entries: [{ id: 'urn:x:all', title: 'Tất cả sách', href: 'https://h/opds/u1/library/all', content: '12 cuốn' }] });
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<feed xmlns="http://www.w3.org/2005/Atom" xmlns:opds="http://opds-spec.org/2010/catalog">');
    expect(xml).toContain('<link rel="self" href="https://h/opds/u1/library/all?page=1" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>');
    expect(xml).toContain('<link rel="start" href="https://h/opds/u1/library"');
    expect(xml).toContain('<link rel="search" href="https://h/opds/u1/library/opensearch.xml" type="application/opensearchdescription+xml"/>');
    expect(xml).toContain('<link rel="subsection" href="https://h/opds/u1/library/all" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>');
    expect(xml).toContain('<content type="text">12 cuốn</content>');
  });
});

describe('acquisitionFeed', () => {
  const entry = { id: 'urn:spinecast:book:b1', title: 'Tom & Jerry <vol 1>', author: 'A "B"', updated: 1_700_000_000, epubHref: 'https://h/opds/u1/library/books/b1.epub', coverHref: 'https://h/opds/u1/library/books/b1/cover', coverType: 'image/png' };

  it('escapes text, emits acquisition and image links', () => {
    const xml = acquisitionFeed({ ...base, next: null, entries: [entry] });
    expect(xml).toContain('<title>Tom &amp; Jerry &lt;vol 1&gt;</title>');
    expect(xml).toContain('<author><name>A &quot;B&quot;</name></author>');
    expect(xml).toContain('<updated>2023-11-14T22:13:20Z</updated>');
    expect(xml).toContain('<link rel="http://opds-spec.org/acquisition" href="https://h/opds/u1/library/books/b1.epub" type="application/epub+zip"/>');
    expect(xml).toContain('<link rel="http://opds-spec.org/image" href="https://h/opds/u1/library/books/b1/cover" type="image/png"/>');
    expect(xml).toContain('<link rel="http://opds-spec.org/image/thumbnail" href="https://h/opds/u1/library/books/b1/cover" type="image/png"/>');
    expect(xml).not.toContain('rel="next"');
  });

  it('omits cover links without a cover and adds next when given', () => {
    const xml = acquisitionFeed({ ...base, next: 'https://h/opds/u1/library/all?page=2', entries: [{ ...entry, coverHref: null, coverType: null }] });
    expect(xml).not.toContain('opds-spec.org/image');
    expect(xml).toContain('<link rel="next" href="https://h/opds/u1/library/all?page=2" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>');
  });

  it('renders an empty feed without entries', () => {
    const xml = acquisitionFeed({ ...base, next: null, entries: [] });
    expect(xml).not.toContain('<entry>');
    expect(xml).toContain('</feed>');
  });
});

describe('openSearchDescription', () => {
  it('points at the search template', () => {
    const xml = openSearchDescription('https://h/opds/u1/library/search?q={searchTerms}');
    expect(xml).toContain('<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">');
    expect(xml).toContain('<Url type="application/atom+xml;profile=opds-catalog;kind=acquisition" template="https://h/opds/u1/library/search?q={searchTerms}"/>');
  });
});
