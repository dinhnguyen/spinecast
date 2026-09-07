import type { ProgressDto } from '../../shared/apiTypes';
import type { Position } from '../../shared/position';

interface ProgressRow {
  book_id: string;
  pct_q: number;
  spine: number;
  xpath: string | null;
  para: number | null;
  anchor: string | null;
  page: number | null;
  pages: number | null;
  updated_at: number;
  last_pushed_at: number | null;
  device_id: string | null;
  observed_at: number | null;
}

const toDto = (r: ProgressRow): ProgressDto => ({
  pctQ: r.pct_q,
  spine: r.spine,
  ...(r.xpath !== null ? { xpath: r.xpath } : {}),
  ...(r.para !== null ? { para: r.para } : {}),
  ...(r.anchor !== null ? { anchor: r.anchor } : {}),
  ...(r.page !== null ? { page: r.page } : {}),
  ...(r.pages !== null ? { pages: r.pages } : {}),
  updatedAt: r.updated_at,
  lastPushedAt: r.last_pushed_at,
  deviceId: r.device_id,
  observedAt: r.observed_at,
});

export const upsertProgress = async (
  db: D1Database,
  bookId: string,
  pos: Position,
  now: number,
  deviceId: string | null,
): Promise<boolean> => {
  const res = await db
    .prepare(
      `insert into reading_progress (book_id, pct_q, spine, xpath, para, anchor, page, pages, updated_at, device_id, observed_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       on conflict(book_id) do update set pct_q = excluded.pct_q, spine = excluded.spine, xpath = excluded.xpath,
         para = excluded.para, anchor = excluded.anchor, page = excluded.page, pages = excluded.pages,
         updated_at = excluded.updated_at, device_id = excluded.device_id, observed_at = excluded.observed_at
       where excluded.observed_at >= coalesce(reading_progress.observed_at, 0)`,
    )
    .bind(
      bookId,
      pos.pctQ,
      pos.spine,
      pos.xpath ?? null,
      pos.para ?? null,
      pos.anchor ?? null,
      pos.page ?? null,
      pos.pages ?? null,
      now,
      deviceId,
      pos.observedAt ?? 0,
    )
    .run();
  return (res.meta.changes ?? 0) > 0;
};

export const getProgress = async (db: D1Database, bookId: string): Promise<ProgressDto | null> => {
  const row = await db.prepare('select * from reading_progress where book_id = ?').bind(bookId).first<ProgressRow>();
  return row ? toDto(row) : null;
};

export const markPushed = async (db: D1Database, bookId: string, ts: number): Promise<void> => {
  await db.prepare('update reading_progress set last_pushed_at = ? where book_id = ?').bind(ts, bookId).run();
};
