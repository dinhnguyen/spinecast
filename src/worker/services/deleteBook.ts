import { type BookRow, deleteBook, deleteBookAndCountBlobHash } from '../db/books';
import { deleteBlob } from '../db/bookBlobs';

// Shared by the single-item and bulk delete routes: a book carrying a blob_hash only
// frees its R2 object once no other book still references that blob (dedup, see
// ingestBook); a legacy row (blob_hash null) deletes exactly as it always did.
export const deleteBookAndBlob = async (db: D1Database, bucket: R2Bucket, book: BookRow): Promise<void> => {
  if (book.blob_hash) {
    await deleteBookAndCountBlobHash(db, book.id, book.blob_hash);
    if (await deleteBlob(db, book.blob_hash)) await bucket.delete(book.r2_key);
  } else {
    await deleteBook(db, book.id);
    await bucket.delete(book.r2_key);
  }
  if (book.cover_r2_key) await bucket.delete(book.cover_r2_key);
};
