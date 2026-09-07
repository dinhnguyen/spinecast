import type { PasskeyDto } from '../../shared/apiTypes';

export interface PasskeyRow {
  id: string;
  user_id: string;
  public_key: string;
  counter: number;
  transports: string;
  name: string;
  created_at: number;
  last_used_at: number | null;
}

// The credential id is the primary key across all users, so a second claim on
// the same id must fail rather than move the row to another account.
export const insertPasskey = async (db: D1Database, row: PasskeyRow): Promise<boolean> => {
  const res = await db
    .prepare(
      `insert into passkeys (id, user_id, public_key, counter, transports, name, created_at, last_used_at)
       values (?, ?, ?, ?, ?, ?, ?, ?)
       on conflict(id) do nothing`,
    )
    .bind(row.id, row.user_id, row.public_key, row.counter, row.transports, row.name, row.created_at, row.last_used_at)
    .run();
  return (res.meta.changes ?? 0) > 0;
};

export const listPasskeys = async (db: D1Database, userId: string): Promise<PasskeyRow[]> => {
  const res = await db.prepare('select * from passkeys where user_id = ? order by created_at, id').bind(userId).all<PasskeyRow>();
  return res.results;
};

export const findPasskeyById = (db: D1Database, id: string): Promise<PasskeyRow | null> =>
  db.prepare('select * from passkeys where id = ?').bind(id).first<PasskeyRow>();

export const renamePasskey = async (db: D1Database, userId: string, id: string, name: string): Promise<boolean> => {
  const res = await db.prepare('update passkeys set name = ? where user_id = ? and id = ?').bind(name, userId, id).run();
  return (res.meta.changes ?? 0) > 0;
};

export const deletePasskey = async (db: D1Database, userId: string, id: string): Promise<boolean> => {
  const res = await db.prepare('delete from passkeys where user_id = ? and id = ?').bind(userId, id).run();
  return (res.meta.changes ?? 0) > 0;
};

export const touchPasskey = async (db: D1Database, id: string, counter: number, ts: number): Promise<void> => {
  await db.prepare('update passkeys set counter = ?, last_used_at = ? where id = ?').bind(counter, ts, id).run();
};

export const toPasskeyDto = (row: PasskeyRow): PasskeyDto => ({
  id: row.id,
  name: row.name,
  createdAt: row.created_at,
  lastUsedAt: row.last_used_at,
});
