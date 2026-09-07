import { strToU8, zipSync } from 'fflate';

export const buildMinimalEpub = (): Uint8Array => {
  const container = `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`;
  const opf = `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:uuid:1</dc:identifier><dc:title>Minimal Book</dc:title><dc:creator>Test Author</dc:creator><dc:language>en</dc:language><meta name="cover" content="cover-img"/></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/><item id="c2" href="c2.xhtml" media-type="application/xhtml+xml"/><item id="cover-img" href="cover.png" media-type="image/png" properties="cover-image"/></manifest><spine><itemref idref="c1"/><itemref idref="c2"/></spine></package>`;
  const nav = `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>nav</title></head><body><nav epub:type="toc"><ol><li><a href="c1.xhtml">Chapter 1</a></li><li><a href="c2.xhtml">Chapter 2</a></li></ol></nav></body></html>`;
  const chapter = (n: number): string =>
    `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter ${n}</title></head><body><h1 id="ch${n}">Chapter ${n}</h1>${Array.from({ length: 40 }, (_, i) => `<p>Paragraph ${i + 1} of chapter ${n}. It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.</p>`).join('')}</body></html>`;
  // 1x1 PNG
  const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));

  return zipSync(
    {
      mimetype: [strToU8('application/epub+zip'), { level: 0 }],
      'META-INF/container.xml': strToU8(container),
      'OEBPS/content.opf': strToU8(opf),
      'OEBPS/nav.xhtml': strToU8(nav),
      'OEBPS/c1.xhtml': strToU8(chapter(1)),
      'OEBPS/c2.xhtml': strToU8(chapter(2)),
      'OEBPS/cover.png': png,
    },
    { level: 6 },
  );
};
