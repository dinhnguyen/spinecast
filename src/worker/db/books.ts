import type { BookDto, ProgressDto } from '../../shared/apiTypes';

export interface BookRow {
  id: string;
  user_id: string;
  title: string;
  author: string;
  filename: string;
  filesize: number;
  r2_key: string;
  cover_r2_key: string | null;
  shared: number;
  hash_partial: string;
  hash_filename: string;
  created_at: number;
  last_opened_at: number | null;
  source_catalog_id: string | null;
  source_entry_id: string | null;
}

interface BookWithProgressRow extends BookRow {
  p_pct_q: number | null;
  p_spine: number | null;
  p_xpath: string | null;
  p_para: number | null;
  p_anchor: string | null;
  p_page: number | null;
  p_pages: number | null;
  p_updated_at: number | null;
  p_last_pushed_at: number | null;
  p_device_id: string | null;
  p_observed_at: number | null;
}

const JOIN = `select b.*, p.pct_q as p_pct_q, p.spine as p_spine, p.xpath as p_xpath, p.para as p_para,
  p.anchor as p_anchor, p.page as p_page, p.pages as p_pages, p.updated_at as p_updated_at,
  p.last_pushed_at as p_last_pushed_at, p.device_id as p_device_id, p.observed_at as p_observed_at
  from books b left join reading_progress p on p.book_id = b.id`;

export const rowToProgress = (r: BookWithProgressRow): ProgressDto | null =>
  r.p_pct_q === null || r.p_spine === null || r.p_updated_at === null
    ? null
    : {
        pctQ: r.p_pct_q,
        spine: r.p_spine,
        ...(r.p_xpath !== null ? { xpath: r.p_xpath } : {}),
        ...(r.p_para !== null ? { para: r.p_para } : {}),
        ...(r.p_anchor !== null ? { anchor: r.p_anchor } : {}),
        ...(r.p_page !== null ? { page: r.p_page } : {}),
        ...(r.p_pages !== null ? { pages: r.p_pages } : {}),
        updatedAt: r.p_updated_at,
        lastPushedAt: r.p_last_pushed_at,
        deviceId: r.p_device_id,
        observedAt: r.p_observed_at,
      };

export const rowToDto = (r: BookWithProgressRow): BookDto => ({
  id: r.id,
  title: r.title,
  author: r.author,
  filename: r.filename,
  filesize: r.filesize,
  hasCover: r.cover_r2_key !== null,
  shared: r.shared === 1,
  hashPartial: r.hash_partial,
  hashFilename: r.hash_filename,
  createdAt: r.created_at,
  lastOpenedAt: r.last_opened_at,
  progress: rowToProgress(r),
});

export const insertBook = async (db: D1Database, row: BookRow): Promise<void> => {
  await db
    .prepare(
      `insert into books (id, user_id, title, author, filename, filesize, r2_key, cover_r2_key, hash_partial, hash_filename, created_at, last_opened_at, source_catalog_id, source_entry_id)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(row.id, row.user_id, row.title, row.author, row.filename, row.filesize, row.r2_key, row.cover_r2_key, row.hash_partial, row.hash_filename, row.created_at, row.last_opened_at, row.source_catalog_id, row.source_entry_id)
    .run();
};

export const listBooksWithProgress = async (db: D1Database, userId: string): Promise<BookDto[]> => {
  const res = await db
    .prepare(`${JOIN} where b.user_id = ? order by b.last_opened_at desc nulls last, b.created_at desc`)
    .bind(userId)
    .all<BookWithProgressRow>();
  return res.results.map(rowToDto);
};

export const findBookWithProgress = async (db: D1Database, userId: string, bookId: string): Promise<BookDto | null> => {
  const row = await db.prepare(`${JOIN} where b.user_id = ? and b.id = ?`).bind(userId, bookId).first<BookWithProgressRow>();
  return row ? rowToDto(row) : null;
};

export const findBook = (db: D1Database, userId: string, bookId: string): Promise<BookRow | null> =>
  db.prepare('select * from books where user_id = ? and id = ?').bind(userId, bookId).first<BookRow>();

export const findBookByPartialHash = (db: D1Database, userId: string, hash: string): Promise<BookRow | null> =>
  db.prepare('select * from books where user_id = ? and hash_partial = ?').bind(userId, hash).first<BookRow>();

export const deleteBook = async (db: D1Database, bookId: string): Promise<void> => {
  await db.prepare('delete from books where id = ?').bind(bookId).run();
};

export const touchBookOpened = async (db: D1Database, bookId: string, ts: number): Promise<void> => {
  await db.prepare('update books set last_opened_at = ? where id = ?').bind(ts, bookId).run();
};

export const setBookShared = async (db: D1Database, userId: string, bookId: string, shared: boolean): Promise<boolean> => {
  const res = await db.prepare('update books set shared = ? where user_id = ? and id = ?').bind(shared ? 1 : 0, userId, bookId).run();
  return (res.meta.changes ?? 0) > 0;
};

export const setBookSourceIfUnset = async (db: D1Database, bookId: string, catalogId: string, entryId: string): Promise<void> => {
  await db
    .prepare('update books set source_catalog_id = ?, source_entry_id = ? where id = ? and source_catalog_id is null and source_entry_id is null')
    .bind(catalogId, entryId, bookId)
    .run();
};

export const listSourceEntryIds = async (db: D1Database, userId: string, catalogId: string, entryIds: string[]): Promise<Map<string, string>> => {
  if (entryIds.length === 0) return new Map();
  const res = await db
    .prepare('select id, source_entry_id from books where user_id = ? and source_catalog_id = ? and source_entry_id is not null')
    .bind(userId, catalogId)
    .all<{ id: string; source_entry_id: string }>();
  return new Map(res.results.map((r) => [r.source_entry_id, r.id]));
};
