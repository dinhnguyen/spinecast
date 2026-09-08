import type { AdminCleanupDto, AdminOverviewDto } from '../../shared/apiTypes';
import { type BlobRow, deleteBlob } from '../db/bookBlobs';

// Accumulate all pages before any deletion happens, so a delete during the scan
// cannot invalidate an in-flight R2 list cursor.
const listBlobObjects = async (bucket: R2Bucket): Promise<R2Object[]> => {
  const objects: R2Object[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket.list({ prefix: 'blobs/', ...(cursor ? { cursor } : {}) });
    objects.push(...page.objects);
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return objects;
};

const findOrphanBlobRows = (db: D1Database): Promise<D1Result<BlobRow>> =>
  db
    .prepare(
      `select bb.* from book_blobs bb
       where not exists (select 1 from books b where b.blob_hash = bb.content_hash)`,
    )
    .all<BlobRow>();

interface CountsRow {
  users: number;
  books: number;
  blobs: number;
  blobBytes: number;
}

export const getAdminOverview = async (db: D1Database, bucket: R2Bucket): Promise<AdminOverviewDto> => {
  const [counts, orphanRows, objects, registeredKeys] = await Promise.all([
    db
      .prepare(
        `select (select count(*) from users) as users,
                (select count(*) from books) as books,
                (select count(*) from book_blobs) as blobs,
                (select coalesce(sum(filesize), 0) from book_blobs) as blobBytes`,
      )
      .first<CountsRow>(),
    findOrphanBlobRows(db),
    listBlobObjects(bucket),
    db.prepare('select r2_key from book_blobs').all<{ r2_key: string }>(),
  ]);
  const registered = new Set(registeredKeys.results.map((r) => r.r2_key));
  const orphanObjects = objects.filter((object) => !registered.has(object.key)).length;
  return {
    users: counts!.users,
    books: counts!.books,
    blobs: counts!.blobs,
    blobBytes: counts!.blobBytes,
    orphanBlobRows: orphanRows.results.length,
    orphanObjects,
  };
};

export const cleanupAdminStorage = async (db: D1Database, bucket: R2Bucket): Promise<AdminCleanupDto> => {
  const [orphanRows, objects] = await Promise.all([findOrphanBlobRows(db), listBlobObjects(bucket)]);
  let deletedRows = 0;
  let deletedObjects = 0;
  const deletedKeys = new Set<string>();

  for (const row of orphanRows.results) {
    // A concurrent upload can register this row between the snapshot above and now;
    // deleteBlob's own condition rechecks that at delete time and no-ops if so.
    if (!(await deleteBlob(db, row.content_hash))) continue;
    deletedRows++;
    if (await bucket.head(row.r2_key)) {
      await bucket.delete(row.r2_key);
      deletedObjects++;
      deletedKeys.add(row.r2_key);
    }
  }

  for (const object of objects) {
    if (deletedKeys.has(object.key)) continue;
    // Recheck registration by r2_key immediately before deleting: a concurrent upload
    // can make this a transient false-positive orphan between listing and now.
    const registered = await db.prepare('select 1 as present from book_blobs where r2_key = ? limit 1').bind(object.key).first();
    if (!registered && (await bucket.head(object.key))) {
      await bucket.delete(object.key);
      deletedObjects++;
    }
  }

  return { deletedRows, deletedObjects };
};
