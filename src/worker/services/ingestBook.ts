import { deleteBlob, findBlobByHash, insertBlobIfMissing } from '../db/bookBlobs';
import { findBookByPartialHash, insertBook } from '../db/books';
import { randomHex, sha256Hex } from './crypto';
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
  const [hashPartial, hashFilename, contentHash] = await Promise.all([
    partialMd5(input.bytes),
    filenameMd5(input.filename),
    sha256Hex(input.bytes),
  ]);
  const existing = await findBookByPartialHash(db, input.userId, hashPartial);
  if (existing) return { ok: false, bookId: existing.id };

  const cover = info.cover && RASTER_TYPES.includes(info.cover.contentType) ? info.cover : null;
  const id = randomHex(16);
  const coverKey = cover ? `users/${input.userId}/books/${id}-cover.${extFor(cover.contentType)}` : null;

  // Content-addressed: identical bytes from any user resolve to the same R2 object.
  // `existingBlob` decides both the key to use and whether this call owns the write
  // below, so a failed insertBook never deletes a blob another row already relies on.
  const existingBlob = await findBlobByHash(db, contentHash);
  const blobR2Key = existingBlob?.r2_key ?? `blobs/${contentHash}.epub`;

  try {
    if (!existingBlob) {
      await bucket.put(blobR2Key, input.bytes, { httpMetadata: { contentType: 'application/epub+zip' } });
      // `on conflict do nothing` inside insertBlobIfMissing absorbs the race where two users
      // import the same brand-new content at once; both PUT identical bytes to the same
      // deterministic key, which is idempotent, so there is nothing to reconcile either way.
      await insertBlobIfMissing(db, { content_hash: contentHash, r2_key: blobR2Key, filesize: input.bytes.length, created_at: Math.floor(Date.now() / 1000) });
    }
    if (cover && coverKey) await bucket.put(coverKey, cover.data, { httpMetadata: { contentType: cover.contentType } });
    await insertBook(db, {
      id,
      user_id: input.userId,
      title: info.title,
      author: info.author,
      filename: input.filename,
      filesize: input.bytes.length,
      r2_key: blobR2Key,
      cover_r2_key: coverKey,
      shared: 0,
      hash_partial: hashPartial,
      hash_filename: hashFilename,
      blob_hash: contentHash,
      created_at: Math.floor(Date.now() / 1000),
      last_opened_at: null,
      source_catalog_id: input.source?.catalogId ?? null,
      source_entry_id: input.source?.entryId ?? null,
    });
  } catch (e) {
    // A concurrent sibling ingest of the same brand-new content may have already
    // committed its books row by the time this call's insertBook fails - deleteBlob's
    // atomic conditional delete (only when no books row still references the hash)
    // is what decides whether that row's blob survives, closing this race.
    if (!existingBlob && (await deleteBlob(db, contentHash))) {
      await bucket.delete(blobR2Key);
    }
    if (coverKey) await bucket.delete(coverKey);
    throw e;
  }
  return { ok: true, bookId: id };
};
