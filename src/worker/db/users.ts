import type { Locale } from '../../shared/apiTypes';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: 'admin' | 'user';
  locale: Locale;
  created_at: number;
  timezone: string;
}

export const findUserByEmail = (db: D1Database, email: string): Promise<UserRow | null> =>
  db.prepare('select * from users where email = ?').bind(email.toLowerCase()).first<UserRow>();

export const findUserById = (db: D1Database, id: string): Promise<UserRow | null> =>
  db.prepare('select * from users where id = ?').bind(id).first<UserRow>();

export const insertUser = async (db: D1Database, row: Omit<UserRow, 'timezone'>): Promise<void> => {
  await db
    .prepare('insert into users (id, email, password_hash, role, locale, created_at) values (?, ?, ?, ?, ?, ?)')
    .bind(row.id, row.email.toLowerCase(), row.password_hash, row.role, row.locale, row.created_at)
    .run();
};

export const updateUserLocale = async (db: D1Database, id: string, locale: Locale): Promise<void> => {
  await db.prepare('update users set locale = ? where id = ?').bind(locale, id).run();
};

export const updateUserTimezoneIfUnset = async (db: D1Database, userId: string, tz: string): Promise<void> => {
  await db.prepare("update users set timezone = ? where id = ? and timezone = ''").bind(tz, userId).run();
};
