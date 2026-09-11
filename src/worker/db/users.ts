import type { Locale } from '../../shared/apiTypes';
import { generateUserSlug } from '../services/userSlug';

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  role: 'admin' | 'user';
  locale: Locale;
  created_at: number;
  timezone: string;
  slug: string | null;
  disabled_at: number | null;
  session_epoch: number;
}

export const findUserByEmail = (db: D1Database, email: string): Promise<UserRow | null> =>
  db.prepare('select * from users where email = ?').bind(email.toLowerCase()).first<UserRow>();

export const findUserById = (db: D1Database, id: string): Promise<UserRow | null> =>
  db.prepare('select * from users where id = ?').bind(id).first<UserRow>();

export const findUserBySlug = (db: D1Database, slug: string): Promise<UserRow | null> =>
  db.prepare('select * from users where slug = ?').bind(slug).first<UserRow>();

// Rows predating the slug migration (and any seeded by hand) get one on first use.
export const ensureUserSlug = async (db: D1Database, user: Pick<UserRow, 'id' | 'slug'>): Promise<string> => {
  if (user.slug) return user.slug;
  for (let i = 0; i < 5; i++) {
    const slug = generateUserSlug();
    try {
      const res = await db.prepare('update users set slug = ? where id = ? and slug is null').bind(slug, user.id).run();
      if (res.meta.changes > 0) return slug;
    } catch {
      continue; // slug already taken, draw another
    }
    // Nothing changed: a concurrent request assigned one first.
    const row = await db.prepare('select slug from users where id = ?').bind(user.id).first<{ slug: string | null }>();
    if (row?.slug) return row.slug;
  }
  throw new Error('could not assign a user slug');
};

export const insertUser = async (
  db: D1Database,
  row: Omit<UserRow, 'timezone' | 'slug' | 'disabled_at' | 'session_epoch'>,
): Promise<void> => {
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
