import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createUser } from '../../../test/helpers';
import { deleteBlob, findBlobByHash, insertBlobIfMissing } from './bookBlobs';
import { insertBook } from './books';

const BLOB = { content_hash: 'hash-a', r2_key: 'blobs/hash-a.epub', filesize: 100, created_at: 1 };

describe('bookBlobs', () => {
  it('returns null for an unknown hash', async () => {
    expect(await findBlobByHash(env.DB, 'nope')).toBeNull();
  });

  it('inserts a new blob and reports it was created', async () => {
    const { blob, created } = await insertBlobIfMissing(env.DB, BLOB);
    expect(created).toBe(true);
    expect(blob).toEqual(BLOB);
    expect(await findBlobByHash(env.DB, 'hash-a')).toEqual(BLOB);
  });

  it('leaves the existing row alone and reports it was not created on a repeat insert', async () => {
    await insertBlobIfMissing(env.DB, BLOB);
    const second = await insertBlobIfMissing(env.DB, { ...BLOB, r2_key: 'blobs/other-key.epub' });
    expect(second.created).toBe(false);
    expect(second.blob.r2_key).toBe('blobs/hash-a.epub');
  });

  it('deletes a blob row and reports it did', async () => {
    await insertBlobIfMissing(env.DB, BLOB);
    expect(await deleteBlob(env.DB, 'hash-a')).toBe(true);
    expect(await findBlobByHash(env.DB, 'hash-a')).toBeNull();
  });

  it('leaves the row alone and reports false when a book still references it', async () => {
    const user = await createUser(env);
    await insertBlobIfMissing(env.DB, BLOB);
    await insertBook(env.DB, {
      id: 'book-a',
      user_id: user.id,
      title: 'Title',
      author: 'Author',
      filename: 'book.epub',
      filesize: 100,
      r2_key: 'blobs/hash-a.epub',
      cover_r2_key: null,
      shared: 0,
      hash_partial: 'partial-a',
      hash_filename: 'filename-a',
      blob_hash: 'hash-a',
      created_at: 1,
      last_opened_at: null,
      source_catalog_id: null,
      source_entry_id: null,
    });
    expect(await deleteBlob(env.DB, 'hash-a')).toBe(false);
    expect(await findBlobByHash(env.DB, 'hash-a')).toEqual(BLOB);
  });
});
