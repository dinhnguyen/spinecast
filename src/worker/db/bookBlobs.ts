export interface BlobRow {
  content_hash: string;
  r2_key: string;
  filesize: number;
  created_at: number;
}

export const findBlobByHash = (db: D1Database, hash: string): Promise<BlobRow | null> =>
  db.prepare('select * from book_blobs where content_hash = ?').bind(hash).first<BlobRow>();

export const insertBlobIfMissing = async (db: D1Database, row: BlobRow): Promise<{ blob: BlobRow; created: boolean }> => {
  const res = await db
    .prepare(
      `insert into book_blobs (content_hash, r2_key, filesize, created_at)
       values (?, ?, ?, ?)
       on conflict(content_hash) do nothing`,
    )
    .bind(row.content_hash, row.r2_key, row.filesize, row.created_at)
    .run();
  if ((res.meta.changes ?? 0) > 0) return { blob: row, created: true };
  return { blob: (await findBlobByHash(db, row.content_hash))!, created: false };
};

export const deleteBlob = async (db: D1Database, hash: string): Promise<boolean> => {
  const res = await db
    .prepare('delete from book_blobs where content_hash = ?1 and not exists (select 1 from books where blob_hash = ?1)')
    .bind(hash)
    .run();
  return (res.meta.changes ?? 0) > 0;
};
