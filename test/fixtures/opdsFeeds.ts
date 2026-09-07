export const CALIBRE_ACQUISITION = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:opds="http://opds-spec.org/2010/catalog">
  <title>Calibre Library</title>
  <link rel="self" href="/opds/all?page=1" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
  <link rel="next" href="/opds/all?page=2" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
  <link rel="search" href="/opds/search?query={searchTerms}" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
  <entry>
    <title>Dune &amp; Sons</title>
    <id>urn:uuid:1111</id>
    <author><name>Frank Herbert</name></author>
    <summary type="text"><![CDATA[A boy & his worm]]></summary>
    <link rel="http://opds-spec.org/image" href="/get/cover/1" type="image/jpeg"/>
    <link rel="http://opds-spec.org/image/thumbnail" href="/get/thumb/1" type="image/jpeg"/>
    <link rel="http://opds-spec.org/acquisition" href="/get/EPUB/1" type="application/epub+zip"/>
    <link rel="http://opds-spec.org/acquisition" href="/get/MOBI/1" type="application/x-mobipocket-ebook"/>
  </entry>
  <entry>
    <title>No Author, No Cover</title>
    <id>urn:uuid:2222</id>
    <link rel="http://opds-spec.org/acquisition/open-access" href="/get/EPUB/2" type="application/epub+zip"/>
  </entry>
  <entry>
    <title>Paper Only</title>
    <id>urn:uuid:3333</id>
    <link rel="alternate" href="/book/3" type="text/html"/>
  </entry>
</feed>`;

export const NAVIGATION_WITH_PREFIX = `<?xml version="1.0" encoding="utf-8"?>
<atom:feed xmlns:atom="http://www.w3.org/2005/Atom">
  <atom:title>Standard Ebooks</atom:title>
  <atom:link rel="search" href="/opensearch.xml" type="application/opensearchdescription+xml"/>
  <atom:entry>
    <atom:title>Tất cả sách</atom:title>
    <atom:id>urn:nav:all</atom:id>
    <atom:content type="text">1234 quyển</atom:content>
    <atom:link rel="subsection" href="/all" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>
  </atom:entry>
</atom:feed>`;

export const OPENSEARCH_DESCRIPTOR = `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <ShortName>Spinecast</ShortName>
  <Url type="application/atom+xml;profile=opds-catalog;kind=acquisition" template="http://host/opds/u1/library/search?q={searchTerms}"/>
  <Url type="text/html" template="http://host/search?q={searchTerms}"/>
</OpenSearchDescription>`;

export const NOT_XML = `<html><body>Login required</body></html>`;
