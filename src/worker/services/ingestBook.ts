import { findBookByPartialHash, insertBook } from '../db/books';
import { randomHex } from './crypto';
import { parseEpub } from './epub';
import { filenameMd5, partialMd5 } from './koHash';

export interface IngestInput {
  userId: string;
  filename: string;
  bytes: Uint8Array;
  source: { catalogId: string; entryId: string } | null;
}

export interface IngestResult {
  ok: boolean;
  bookId: string;
}

const RASTER_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

const extFor = (contentType: string): string =>
  contentType === 'image/png' ? 'png' : contentType === 'image/gif' ? 'gif' : contentType === 'image/webp' ? 'webp' : 'jpg';

export const ingestBook = async (db: D1Database, bucket: R2Bucket, input: IngestInput): Promise<IngestResult> => {
  const info = parseEpub(input.bytes);
  const [hashPartial, hashFilename] = await Promise.all([partialMd5(input.bytes), filenameMd5(input.filename)]);
  const existing = await findBookByPartialHash(db, input.userId, hashPartial);
  if (existing) return { ok: false, bookId: existing.id };

  const cover = info.cover && RASTER_TYPES.includes(info.cover.contentType) ? info.cover : null;
  const id = randomHex(16);
  const r2Key = `users/${input.userId}/books/${id}.epub`;
  const coverKey = cover ? `users/${input.userId}/books/${id}-cover.${extFor(cover.contentType)}` : null;
  try {
    await bucket.put(r2Key, input.bytes, { httpMetadata: { contentType: 'application/epub+zip' } });
    if (cover && coverKey) await bucket.put(coverKey, cover.data, { httpMetadata: { contentType: cover.contentType } });
    await insertBook(db, {
      id,
      user_id: input.userId,
      title: info.title,
      author: info.author,
      filename: input.filename,
      filesize: input.bytes.length,
      r2_key: r2Key,
      cover_r2_key: coverKey,
      shared: 0,
      hash_partial: hashPartial,
      hash_filename: hashFilename,
      created_at: Math.floor(Date.now() / 1000),
      last_opened_at: null,
      source_catalog_id: input.source?.catalogId ?? null,
      source_entry_id: input.source?.entryId ?? null,
    });
  } catch (e) {
    await bucket.delete(r2Key);
    if (coverKey) await bucket.delete(coverKey);
    throw e;
  }
  return { ok: true, bookId: id };
};
