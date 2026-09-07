export interface ReadingSessionRow {
  id: string;
  user_id: string;
  book_id: string;
  started_at: number;
  ended_at: number;
  seconds: number;
  pages: number;
  device_id: string | null;
}

export const insertSession = async (db: D1Database, row: ReadingSessionRow): Promise<void> => {
  await db
    .prepare(
      'insert into reading_sessions (id, user_id, book_id, started_at, ended_at, seconds, pages, device_id) values (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(row.id, row.user_id, row.book_id, row.started_at, row.ended_at, row.seconds, row.pages, row.device_id)
    .run();
};

export const findSession = (db: D1Database, userId: string, id: string): Promise<ReadingSessionRow | null> =>
  db.prepare('select * from reading_sessions where user_id = ? and id = ?').bind(userId, id).first<ReadingSessionRow>();

export const updateSessionProgress = async (
  db: D1Database,
  id: string,
  pages: number,
  seconds: number,
  endedAt: number,
): Promise<void> => {
  await db
    .prepare('update reading_sessions set pages = ?, seconds = ?, ended_at = ? where id = ?')
    .bind(pages, seconds, endedAt, id)
    .run();
};

export const listSessions = async (db: D1Database, userId: string): Promise<ReadingSessionRow[]> => {
  const res = await db
    .prepare('select * from reading_sessions where user_id = ? order by started_at')
    .bind(userId)
    .all<ReadingSessionRow>();
  return res.results;
};

export const listFinishedBookIds = async (db: D1Database, userId: string, threshold: number): Promise<string[]> => {
  const res = await db
    .prepare(
      'select p.book_id as book_id from reading_progress p join books b on b.id = p.book_id where b.user_id = ? and p.pct_q >= ? order by p.book_id',
    )
    .bind(userId, threshold)
    .all<{ book_id: string }>();
  return res.results.map((r) => r.book_id);
};
