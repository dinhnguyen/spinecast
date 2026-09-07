export interface ClippingRow {
  id: string;
  book_id: string;
  spine: number | null;
  start_page: number | null;
  end_page: number | null;
  pages: number | null;
  start_word: number | null;
  end_word: number | null;
  words: number | null;
  para: number | null;
  chapter: string | null;
  text: string;
  note: string | null;
  color: string | null;
  // Local only. The server's clipping shape has no cfi, so this is never pushed
  // and stays null for a clipping that arrived from another device.
  cfi: string | null;
  created_at: number;
  deleted: number;
  updated_at: number;
  dirty: number;
}

const COLS = 'id, book_id, spine, start_page, end_page, pages, start_word, end_word, words, para, chapter, text, note, color, cfi, created_at, deleted, updated_at, dirty';

export const upsertClipping = async (db: D1Database, row: ClippingRow): Promise<void> => {
  await db
    .prepare(
      `insert into clippings (${COLS}) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       on conflict(book_id, id) do update set spine = excluded.spine, start_page = excluded.start_page,
         end_page = excluded.end_page, pages = excluded.pages, start_word = excluded.start_word,
         end_word = excluded.end_word, words = excluded.words, para = excluded.para,
         chapter = coalesce(excluded.chapter, clippings.chapter), text = excluded.text,
         note = excluded.note, color = excluded.color,
         cfi = coalesce(excluded.cfi, clippings.cfi),
         created_at = excluded.created_at, deleted = excluded.deleted,
         updated_at = excluded.updated_at, dirty = excluded.dirty`,
    )
    .bind(row.id, row.book_id, row.spine, row.start_page, row.end_page, row.pages, row.start_word, row.end_word, row.words, row.para, row.chapter, row.text, row.note, row.color, row.cfi, row.created_at, row.deleted, row.updated_at, row.dirty)
    .run();
};

export const listClippings = async (db: D1Database, bookId: string): Promise<ClippingRow[]> => {
  const res = await db
    .prepare('select * from clippings where book_id = ? and deleted = 0 order by spine, para, created_at')
    .bind(bookId)
    .all<ClippingRow>();
  return res.results;
};

export const findClipping = (db: D1Database, bookId: string, id: string): Promise<ClippingRow | null> =>
  db.prepare('select * from clippings where book_id = ? and id = ?').bind(bookId, id).first<ClippingRow>();

export const markClippingDeleted = async (db: D1Database, bookId: string, id: string, updatedAt: number): Promise<boolean> => {
  const res = await db
    .prepare('update clippings set deleted = 1, dirty = 1, updated_at = ? where book_id = ? and id = ?')
    .bind(updatedAt, bookId, id)
    .run();
  return (res.meta.changes ?? 0) > 0;
};

export const listDirtyClippings = async (db: D1Database, bookId: string): Promise<ClippingRow[]> => {
  const res = await db
    .prepare('select * from clippings where book_id = ? and dirty = 1 order by spine, para, created_at')
    .bind(bookId)
    .all<ClippingRow>();
  return res.results;
};

export const clearClippingDirty = async (db: D1Database, bookId: string, ids: string[]): Promise<void> => {
  if (ids.length === 0) return;
  const holes = ids.map(() => '?').join(', ');
  await db.prepare(`update clippings set dirty = 0 where book_id = ? and id in (${holes})`).bind(bookId, ...ids).run();
};

// cfi is local, so recording it must not make the row look edited or unsynced.
export const setClippingCfi = async (db: D1Database, bookId: string, id: string, cfi: string): Promise<void> => {
  await db.prepare('update clippings set cfi = ? where book_id = ? and id = ?').bind(cfi, bookId, id).run();
};
