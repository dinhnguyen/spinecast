import { describe, expect, it } from 'vitest';
import { acquisitionFeed, navigationFeed } from '../opds/feed';
import { CALIBRE_ACQUISITION, NAVIGATION_WITH_PREFIX, NOT_XML, OPENSEARCH_DESCRIPTOR } from '../../../test/fixtures/opdsFeeds';
import { FeedParseError, parseFeed, parseOpenSearch } from './parseFeed';

describe('parseFeed', () => {
  it('reads an acquisition feed, preferring the epub link and the thumbnail', () => {
    const feed = parseFeed(CALIBRE_ACQUISITION);
    expect(feed.title).toBe('Calibre Library');
    expect(feed.next).toBe('/opds/all?page=2');
    expect(feed.searchTemplate).toBe('/opds/search?query={searchTerms}');
    expect(feed.searchDescriptor).toBeNull();
    expect(feed.nav).toEqual([]);
    expect(feed.entries).toHaveLength(2);
    expect(feed.entries[0]).toEqual({
      id: 'urn:uuid:1111',
      title: 'Dune & Sons',
      author: 'Frank Herbert',
      summary: 'A boy & his worm',
      acquisition: '/get/EPUB/1',
      coverHref: '/get/thumb/1',
    });
    expect(feed.entries[1]).toEqual({
      id: 'urn:uuid:2222',
      title: 'No Author, No Cover',
      author: '',
      summary: '',
      acquisition: '/get/EPUB/2',
      coverHref: null,
    });
  });

  it('drops an entry with neither a navigation nor an epub acquisition link', () => {
    expect(parseFeed(CALIBRE_ACQUISITION).entries.map((e) => e.id)).not.toContain('urn:uuid:3333');
  });

  it('reads a navigation feed written with a namespace prefix', () => {
    const feed = parseFeed(NAVIGATION_WITH_PREFIX);
    expect(feed.title).toBe('Standard Ebooks');
    expect(feed.entries).toEqual([]);
    expect(feed.nav).toEqual([{ rel: 'subsection', href: '/all', type: 'application/atom+xml;profile=opds-catalog;kind=acquisition', title: 'Tất cả sách', content: '1234 quyển' }]);
    expect(feed.searchTemplate).toBeNull();
    expect(feed.searchDescriptor).toBe('/opensearch.xml');
  });

  it('round-trips the app own feeds', () => {
    const base = { id: 'urn:self', title: 'Thư viện riêng', self: '/opds/u1/library/all', start: '/opds/u1/library', updated: 1_700_000_000 };
    const nav = parseFeed(navigationFeed({ ...base, searchHref: '/opds/u1/library/opensearch.xml', entries: [{ id: 'urn:all', title: 'Tất cả sách', href: '/opds/u1/library/all', content: '3 sách' }] }));
    expect(nav.nav.map((n) => n.title)).toEqual(['Tất cả sách']);
    expect(nav.searchDescriptor).toBe('/opds/u1/library/opensearch.xml');

    const acq = parseFeed(
      acquisitionFeed({
        ...base,
        next: null,
        entries: [{ id: 'urn:book:1', title: 'Sách "một"', author: 'Tác giả & Co', updated: 1_700_000_000, epubHref: '/opds/u1/library/books/1.epub', coverHref: '/opds/u1/library/books/1/cover', coverType: 'image/jpeg' }],
      }),
    );
    expect(acq.entries[0]).toMatchObject({ id: 'urn:book:1', title: 'Sách "một"', author: 'Tác giả & Co', acquisition: '/opds/u1/library/books/1.epub', coverHref: '/opds/u1/library/books/1/cover' });
  });

  it('handles a single entry, which the xml parser hands back unwrapped', () => {
    expect(parseFeed(NAVIGATION_WITH_PREFIX).nav).toHaveLength(1);
  });

  it('throws FeedParseError for html and for malformed xml', () => {
    expect(() => parseFeed(NOT_XML)).toThrow(FeedParseError);
    expect(() => parseFeed('<feed><title>x')).toThrow(FeedParseError);
    expect(() => parseFeed('')).toThrow(FeedParseError);
  });
});

describe('parseOpenSearch', () => {
  it('picks the acquisition template and ignores the html one', () => {
    expect(parseOpenSearch(OPENSEARCH_DESCRIPTOR)).toBe('http://host/opds/u1/library/search?q={searchTerms}');
  });

  it('returns null when there is no usable template', () => {
    expect(parseOpenSearch('<OpenSearchDescription><ShortName>x</ShortName></OpenSearchDescription>')).toBeNull();
    expect(parseOpenSearch(NOT_XML)).toBeNull();
  });
});
