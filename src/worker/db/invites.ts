export interface InviteRow {
  code: string;
  created_by: string;
  used_by: string | null;
  expires_at: number;
  created_at: number;
}

export const findInvite = (db: D1Database, code: string): Promise<InviteRow | null> =>
  db.prepare('select * from invites where code = ?').bind(code).first<InviteRow>();

export const insertInvite = async (db: D1Database, row: InviteRow): Promise<void> => {
  await db
    .prepare('insert into invites (code, created_by, used_by, expires_at, created_at) values (?, ?, ?, ?, ?)')
    .bind(row.code, row.created_by, row.used_by, row.expires_at, row.created_at)
    .run();
};

export const markInviteUsed = async (db: D1Database, code: string, userId: string): Promise<void> => {
  await db.prepare('update invites set used_by = ? where code = ?').bind(userId, code).run();
};

export const listInvites = async (db: D1Database, createdBy: string): Promise<InviteRow[]> => {
  const res = await db
    .prepare('select * from invites where created_by = ? order by created_at desc')
    .bind(createdBy)
    .all<InviteRow>();
  return res.results;
};
