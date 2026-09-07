import type { BookStatsValues, GlobalStatsValues } from '../services/recomputeStats';

export const markStatsDirty = async (db: D1Database, userId: string, bookId: string): Promise<void> => {
  await db.batch([
    db
      .prepare('insert into global_stats (user_id, dirty) values (?, 1) on conflict(user_id) do update set dirty = 1')
      .bind(userId),
    db
      .prepare('insert into book_stats (book_id, dirty) values (?, 1) on conflict(book_id) do update set dirty = 1')
      .bind(bookId),
  ]);
};

export const isGlobalDirty = async (db: D1Database, userId: string): Promise<boolean> => {
  const row = await db.prepare('select dirty from global_stats where user_id = ?').bind(userId).first<{ dirty: number }>();
  return row === null || row.dirty === 1;
};

export const saveStats = async (
  db: D1Database,
  userId: string,
  global: GlobalStatsValues,
  books: Map<string, BookStatsValues>,
): Promise<void> => {
  const statements = [
    db
      .prepare(
        `insert into global_stats (user_id, sessions, seconds, pages, completed, tod, dow, anchor_day, history_b64, minutes_b64, streak, dirty)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
         on conflict(user_id) do update set sessions = excluded.sessions, seconds = excluded.seconds, pages = excluded.pages,
           completed = excluded.completed, tod = excluded.tod, dow = excluded.dow, anchor_day = excluded.anchor_day,
           history_b64 = excluded.history_b64, minutes_b64 = excluded.minutes_b64, streak = excluded.streak, dirty = 0`,
      )
      .bind(
        userId,
        global.sessions,
        global.seconds,
        global.pages,
        global.completed,
        JSON.stringify(global.tod),
        JSON.stringify(global.dow),
        global.anchor_day,
        global.history_b64,
        global.minutes_b64,
        global.streak,
      ),
  ];
  for (const [bookId, b] of books) {
    statements.push(
      db
        .prepare(
          `insert into book_stats (book_id, sessions, seconds, pages, completed, avg_fwd, pace_n, tod, dow, start_date, finished_date, dirty)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
           on conflict(book_id) do update set sessions = excluded.sessions, seconds = excluded.seconds, pages = excluded.pages,
             completed = excluded.completed, avg_fwd = excluded.avg_fwd, pace_n = excluded.pace_n, tod = excluded.tod,
             dow = excluded.dow, start_date = excluded.start_date, finished_date = excluded.finished_date, dirty = 0`,
        )
        .bind(
          bookId,
          b.sessions,
          b.seconds,
          b.pages,
          b.completed,
          b.avg_fwd,
          b.pace_n,
          JSON.stringify(b.tod),
          JSON.stringify(b.dow),
          b.start_date,
          b.finished_date,
        ),
    );
  }
  await db.batch(statements);
};

const nums = (raw: string, len: number): number[] => {
  try {
    const v: unknown = JSON.parse(raw);
    if (Array.isArray(v) && v.length === len && v.every((n) => typeof n === 'number')) return v as number[];
  } catch {
    // fall through to zeroes
  }
  return new Array(len).fill(0);
};

export const readGlobalStats = async (db: D1Database, userId: string): Promise<GlobalStatsValues | null> => {
  const row = await db
    .prepare('select * from global_stats where user_id = ?')
    .bind(userId)
    .first<{
      sessions: number;
      seconds: number;
      pages: number;
      completed: number;
      tod: string;
      dow: string;
      anchor_day: number;
      history_b64: string;
      minutes_b64: string;
      streak: number;
    }>();
  if (!row) return null;
  return {
    sessions: row.sessions,
    seconds: row.seconds,
    pages: row.pages,
    completed: row.completed,
    tod: nums(row.tod, 4),
    dow: nums(row.dow, 7),
    anchor_day: row.anchor_day,
    history_b64: row.history_b64,
    minutes_b64: row.minutes_b64,
    streak: row.streak,
    current_streak: 0,
  };
};
