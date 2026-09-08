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

export type InviteWithUserRow = InviteRow & { used_by_email: string | null };

export const listInvites = async (db: D1Database, createdBy: string): Promise<InviteWithUserRow[]> => {
  const res = await db
    .prepare(
      'select i.*, u.email as used_by_email from invites i left join users u on u.id = i.used_by where i.created_by = ? order by i.created_at desc',
    )
    .bind(createdBy)
    .all<InviteWithUserRow>();
  return res.results;
};

export const revokeUnusedInvite = async (db: D1Database, createdBy: string, code: string): Promise<boolean> => {
  const result = await db
    .prepare('delete from invites where code = ? and created_by = ? and used_by is null')
    .bind(code, createdBy)
    .run();
  return (result.meta.changes ?? 0) > 0;
};
