export interface DeviceRow {
  id: string;
  user_id: string;
  name: string;
  created_at: number;
  last_seen_at: number;
}

export const insertDevice = async (db: D1Database, row: DeviceRow): Promise<void> => {
  await db
    .prepare('insert into devices (id, user_id, name, created_at, last_seen_at) values (?, ?, ?, ?, ?)')
    .bind(row.id, row.user_id, row.name, row.created_at, row.last_seen_at)
    .run();
};

export const listDevices = async (db: D1Database, userId: string): Promise<DeviceRow[]> => {
  const res = await db
    .prepare('select * from devices where user_id = ? order by last_seen_at desc')
    .bind(userId)
    .all<DeviceRow>();
  return res.results;
};

export const findDevice = (db: D1Database, userId: string, id: string): Promise<DeviceRow | null> =>
  db.prepare('select * from devices where user_id = ? and id = ?').bind(userId, id).first<DeviceRow>();

export const renameDevice = async (db: D1Database, userId: string, id: string, name: string): Promise<boolean> => {
  const res = await db.prepare('update devices set name = ? where user_id = ? and id = ?').bind(name, userId, id).run();
  return (res.meta.changes ?? 0) > 0;
};

export const deleteDevice = async (db: D1Database, userId: string, id: string): Promise<boolean> => {
  const res = await db.prepare('delete from devices where user_id = ? and id = ?').bind(userId, id).run();
  return (res.meta.changes ?? 0) > 0;
};

export const touchDevice = async (db: D1Database, userId: string, id: string, now: number): Promise<void> => {
  await db.prepare('update devices set last_seen_at = ? where user_id = ? and id = ?').bind(now, userId, id).run();
};

export const pruneDevices = async (db: D1Database, userId: string, before: number): Promise<void> => {
  await db.prepare('delete from devices where user_id = ? and last_seen_at < ?').bind(userId, before).run();
};
