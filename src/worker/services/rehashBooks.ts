import type { AdminRehashDto } from '../../shared/apiTypes';
import { partialMd5Ranged } from './koHash';

// Each book costs one head plus at most twelve ranged reads, so a batch stays
// well inside the subrequest budget. Keyset pagination by id: the caller passes
// the returned cursor back until it comes out null.
export const REHASH_BATCH = 40;

interface Row {
  id: string;
  r2_key: string;
  hash_partial: string;
}

// Recomputes books.hash_partial for rows written before the offset fix in
// koHash. Reads only the chunks the hash covers rather than whole EPUBs.
export const rehashBooks = async (db: D1Database, bucket: R2Bucket, after: string | null): Promise<AdminRehashDto> => {
  const rows = await db
    .prepare('select id, r2_key, hash_partial from books where id > ? order by id limit ?')
    .bind(after ?? '', REHASH_BATCH)
    .all<Row>();

  let updated = 0;
  let missing = 0;
  for (const row of rows.results) {
    // The object's own size, not books.filesize: the stored value decides where
    // the chunk walk stops, and a hash built from a stale one would be a value
    // ingest could never reproduce.
    const head = await bucket.head(row.r2_key);
    if (!head) {
      missing++;
      continue;
    }
    const hash = await partialMd5Ranged(head.size, async (offset, length) => {
      const part = await bucket.get(row.r2_key, { range: { offset, length } });
      return part ? new Uint8Array(await part.arrayBuffer()) : null;
    });
    if (hash === null) {
      missing++;
      continue;
    }
    if (hash === row.hash_partial) continue;
    await db.prepare('update books set hash_partial = ? where id = ?').bind(hash, row.id).run();
    updated++;
  }

  const last = rows.results.at(-1);
  return {
    scanned: rows.results.length,
    updated,
    missing,
    cursor: rows.results.length === REHASH_BATCH && last ? last.id : null,
  };
};
