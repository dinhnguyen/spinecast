import { env } from 'cloudflare:workers';
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { createUser, fixtureEpub } from '../../../test/helpers';
import { findBlobByHash } from '../db/bookBlobs';
import { findBook } from '../db/books';
import { insertCatalog } from '../db/opdsCatalogs';
import { sha256Hex } from './crypto';
import { EpubParseError } from './epub';
import { ingestBook } from './ingestBook';

// Distinct content from fixtureEpub() - other tests in this file already ingest fixtureEpub()'s
// bytes, so its content_hash has an existing book_blobs row by the time later tests run. This
// gives a hash guaranteed to be brand new, so the "new blob" branch actually executes.
// `identifier` lets callers get several mutually-distinct fixtures out of this same builder.
const rollbackFixtureEpub = (identifier = 'rollback-test'): Uint8Array => {
  const container = `<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`;
  const opf = `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="id">urn:uuid:${identifier}</dc:identifier><dc:title>Rollback Test Book</dc:title><dc:creator>Test Author</dc:creator><dc:language>en</dc:language></metadata><manifest><item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>`;
  const nav = `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><head><title>nav</title></head><body><nav epub:type="toc"><ol><li><a href="c1.xhtml">Chapter 1</a></li></ol></nav></body></html>`;
  const chapter = `<?xml version="1.0"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>Chapter 1</title></head><body><h1>Chapter 1</h1><p>Text.</p></body></html>`;
  return zipSync(
    {
      mimetype: [strToU8('application/epub+zip'), { level: 0 }],
      'META-INF/container.xml': strToU8(container),
      'OEBPS/content.opf': strToU8(opf),
      'OEBPS/nav.xhtml': strToU8(nav),
      'OEBPS/c1.xhtml': strToU8(chapter),
    },
    { level: 6 },
  );
};

describe('ingestBook', () => {
  it('stores the file, the row and the provenance', async () => {
    const user = await createUser(env);
    await insertCatalog(env.DB, { id: 'cat-a', user_id: user.id, name: 'Calibre', url: 'https://books.test/opds', username: '', password_enc: '', created_at: 1, last_ok_at: null, last_error: null });
    const res = await ingestBook(env.DB, env.BOOKS, {
      userId: user.id,
      filename: 'Minimal Book.epub',
      bytes: fixtureEpub(),
      source: { catalogId: 'cat-a', entryId: 'urn:entry:1' },
    });
    expect(res.ok).toBe(true);
    const row = (await findBook(env.DB, user.id, res.bookId))!;
    expect(row.filename).toBe('Minimal Book.epub');
    expect(row.hash_partial).toMatch(/^[0-9a-f]{32}$/);
    expect(row.source_catalog_id).toBe('cat-a');
    expect(row.source_entry_id).toBe('urn:entry:1');
    expect(await env.BOOKS.get(row.r2_key)).not.toBeNull();
  });

  it('reports a duplicate with the existing book id and writes nothing new', async () => {
    const user = await createUser(env);
    const first = await ingestBook(env.DB, env.BOOKS, { userId: user.id, filename: 'a.epub', bytes: fixtureEpub(), source: null });
    const second = await ingestBook(env.DB, env.BOOKS, { userId: user.id, filename: 'b.epub', bytes: fixtureEpub(), source: null });
    expect(second).toEqual({ ok: false, bookId: first.bookId });
  });

  it('throws EpubParseError for bytes that are not an epub', async () => {
    const user = await createUser(env);
    await expect(ingestBook(env.DB, env.BOOKS, { userId: user.id, filename: 'x.epub', bytes: new Uint8Array([1, 2, 3]), source: null })).rejects.toBeInstanceOf(EpubParseError);
  });

  it('shares one R2 object when two different users import identical bytes', async () => {
    const a = await createUser(env);
    const b = await createUser(env);
    const first = await ingestBook(env.DB, env.BOOKS, { userId: a.id, filename: 'a.epub', bytes: fixtureEpub(), source: null });
    const second = await ingestBook(env.DB, env.BOOKS, { userId: b.id, filename: 'b.epub', bytes: fixtureEpub(), source: null });
    const rowA = (await findBook(env.DB, a.id, first.bookId))!;
    const rowB = (await findBook(env.DB, b.id, second.bookId))!;
    expect(rowB.r2_key).toBe(rowA.r2_key);
    expect(rowA.r2_key.startsWith('blobs/')).toBe(true);
    const hash = await sha256Hex(fixtureEpub());
    expect(rowA.blob_hash).toBe(hash);
    const blob = await findBlobByHash(env.DB, hash);
    expect(blob?.r2_key).toBe(rowA.r2_key);
  });

  it('rolls back the r2 object and the book_blobs row when insertBook fails on a new blob', async () => {
    const user = await createUser(env);
    const bytes = rollbackFixtureEpub();
    const hash = await sha256Hex(bytes);
    expect(await findBlobByHash(env.DB, hash)).toBeNull();
    const original = env.DB.prepare;
    // Force a D1 failure on the books insert specifically, leaving the earlier
    // findBookByPartialHash/findBlobByHash reads and the book_blobs insert untouched.
    env.DB.prepare = ((sql: string) => {
      if (sql.trim().startsWith('insert into books (')) throw new Error('boom');
      return original.call(env.DB, sql);
    }) as typeof env.DB.prepare;
    try {
      await expect(
        ingestBook(env.DB, env.BOOKS, { userId: user.id, filename: 'a.epub', bytes, source: null }),
      ).rejects.toThrow('boom');
    } finally {
      env.DB.prepare = original;
    }
    expect(await findBlobByHash(env.DB, hash)).toBeNull();
    expect(await env.BOOKS.head(`blobs/${hash}.epub`)).toBeNull();
  });

  it('does not delete a blob a concurrent successful sibling now depends on', async () => {
    const a = await createUser(env);
    const b = await createUser(env);
    const bytes = rollbackFixtureEpub('sibling-race-test');
    const hash = await sha256Hex(bytes);

    // A's ingest of brand-new content succeeds and commits first - a books row now
    // legitimately depends on this blob.
    const first = await ingestBook(env.DB, env.BOOKS, { userId: a.id, filename: 'a.epub', bytes, source: null });
    expect(first.ok).toBe(true);

    const original = env.DB.prepare;
    let fakedBlobRead = false;
    // Simulate B's ingest having read `existingBlob = null` concurrently, before A's
    // commit landed (the race the reviewer described), then failing at its own
    // insertBook - B's rollback must not destroy the blob A's row now depends on.
    env.DB.prepare = ((sql: string) => {
      const trimmed = sql.trim();
      if (!fakedBlobRead && trimmed.startsWith('select * from book_blobs where content_hash = ?')) {
        fakedBlobRead = true;
        return { bind: () => ({ first: async () => null }) } as unknown as D1PreparedStatement;
      }
      if (trimmed.startsWith('insert into books (')) throw new Error('boom');
      return original.call(env.DB, sql);
    }) as typeof env.DB.prepare;
    try {
      await expect(
        ingestBook(env.DB, env.BOOKS, { userId: b.id, filename: 'b.epub', bytes, source: null }),
      ).rejects.toThrow('boom');
    } finally {
      env.DB.prepare = original;
    }

    // A's book still resolves to a live blob row and R2 object.
    const blob = await findBlobByHash(env.DB, hash);
    expect(blob).not.toBeNull();
    expect(await env.BOOKS.head(blob!.r2_key)).not.toBeNull();
  });

  it('does not delete a reused blob when a later insertBook for the same content fails', async () => {
    const a = await createUser(env);
    const b = await createUser(env);
    const bytes = rollbackFixtureEpub('reused-blob-test');
    const hash = await sha256Hex(bytes);

    // Ingest the content successfully first, so book_blobs already has a row and R2
    // already has the object for this hash - the next call's `existingBlob` is truthy.
    const first = await ingestBook(env.DB, env.BOOKS, { userId: a.id, filename: 'a.epub', bytes, source: null });
    expect(first.ok).toBe(true);

    const original = env.DB.prepare;
    env.DB.prepare = ((sql: string) => {
      if (sql.trim().startsWith('insert into books (')) throw new Error('boom');
      return original.call(env.DB, sql);
    }) as typeof env.DB.prepare;
    try {
      await expect(
        ingestBook(env.DB, env.BOOKS, { userId: b.id, filename: 'b.epub', bytes, source: null }),
      ).rejects.toThrow('boom');
    } finally {
      env.DB.prepare = original;
    }

    // The reused blob row and its R2 object must survive b's failed insertBook.
    const blob = await findBlobByHash(env.DB, hash);
    expect(blob).not.toBeNull();
    expect(await env.BOOKS.head(blob!.r2_key)).not.toBeNull();
  });
});
