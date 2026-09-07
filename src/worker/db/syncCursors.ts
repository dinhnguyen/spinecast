export type SyncKind = 'bookmarks' | 'clippings';

export const getCursor = async (db: D1Database, userId: string, bookId: string, kind: SyncKind): Promise<number> => {
  const row = await db
    .prepare('select since from sync_cursors where user_id = ? and book_id = ? and kind = ?')
    .bind(userId, bookId, kind)
    .first<{ since: number }>();
  return row?.since ?? 0;
};

export const setCursor = async (db: D1Database, userId: string, bookId: string, kind: SyncKind, since: number): Promise<void> => {
  await db
    .prepare(
      `insert into sync_cursors (user_id, book_id, kind, since) values (?, ?, ?, ?)
       on conflict(user_id, book_id, kind) do update set since = excluded.since`,
    )
    .bind(userId, bookId, kind, since)
    .run();
};
