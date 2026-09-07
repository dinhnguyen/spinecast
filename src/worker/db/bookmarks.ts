export interface BookmarkRow {
  id: string;
  book_id: string;
  xpath: string;
  percentage: number;
  summary: string | null;
  si: number | null;
  pc: number | null;
  pp: number | null;
  // Local only. The server's bookmark shape has no chapter field, so this is never
  // pushed and stays null for bookmarks that arrive from another device.
  chapter: string | null;
  deleted: number;
  updated_at: number;
  dirty: number;
}

export const upsertBookmark = async (db: D1Database, row: BookmarkRow): Promise<void> => {
  await db
    .prepare(
      `insert into bookmarks (id, book_id, xpath, percentage, summary, si, pc, pp, chapter, deleted, updated_at, dirty)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       on conflict(book_id, id) do update set xpath = excluded.xpath, percentage = excluded.percentage,
         summary = excluded.summary, si = excluded.si, pc = excluded.pc, pp = excluded.pp,
         chapter = coalesce(excluded.chapter, bookmarks.chapter),
         deleted = excluded.deleted, updated_at = excluded.updated_at, dirty = excluded.dirty`,
    )
    .bind(row.id, row.book_id, row.xpath, row.percentage, row.summary, row.si, row.pc, row.pp, row.chapter, row.deleted, row.updated_at, row.dirty)
    .run();
};

export const listBookmarks = async (db: D1Database, bookId: string): Promise<BookmarkRow[]> => {
  const res = await db
    .prepare('select * from bookmarks where book_id = ? and deleted = 0 order by percentage')
    .bind(bookId)
    .all<BookmarkRow>();
  return res.results;
};

export const findBookmark = (db: D1Database, bookId: string, id: string): Promise<BookmarkRow | null> =>
  db.prepare('select * from bookmarks where book_id = ? and id = ?').bind(bookId, id).first<BookmarkRow>();

export const markBookmarkDeleted = async (db: D1Database, bookId: string, id: string, updatedAt: number): Promise<boolean> => {
  const res = await db
    .prepare('update bookmarks set deleted = 1, dirty = 1, updated_at = ? where book_id = ? and id = ?')
    .bind(updatedAt, bookId, id)
    .run();
  return (res.meta.changes ?? 0) > 0;
};

export const listDirtyBookmarks = async (db: D1Database, bookId: string): Promise<BookmarkRow[]> => {
  const res = await db
    .prepare('select * from bookmarks where book_id = ? and dirty = 1 order by percentage')
    .bind(bookId)
    .all<BookmarkRow>();
  return res.results;
};

export const clearBookmarkDirty = async (db: D1Database, bookId: string, ids: string[]): Promise<void> => {
  if (ids.length === 0) return;
  const holes = ids.map(() => '?').join(', ');
  await db
    .prepare(`update bookmarks set dirty = 0 where book_id = ? and id in (${holes})`)
    .bind(bookId, ...ids)
    .run();
};
