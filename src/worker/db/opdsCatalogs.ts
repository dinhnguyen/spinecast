import type { OpdsCatalogDto } from '../../shared/apiTypes';

export interface OpdsCatalogRow {
  id: string;
  user_id: string;
  name: string;
  url: string;
  username: string;
  password_enc: string;
  created_at: number;
  last_ok_at: number | null;
  last_error: string | null;
}

export const insertCatalog = async (db: D1Database, row: OpdsCatalogRow): Promise<void> => {
  await db
    .prepare(
      `insert into opds_catalogs (id, user_id, name, url, username, password_enc, created_at, last_ok_at, last_error)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(row.id, row.user_id, row.name, row.url, row.username, row.password_enc, row.created_at, row.last_ok_at, row.last_error)
    .run();
};

export const listCatalogs = async (db: D1Database, userId: string): Promise<OpdsCatalogRow[]> => {
  const res = await db.prepare('select * from opds_catalogs where user_id = ? order by created_at, id').bind(userId).all<OpdsCatalogRow>();
  return res.results;
};

export const findCatalog = (db: D1Database, userId: string, id: string): Promise<OpdsCatalogRow | null> =>
  db.prepare('select * from opds_catalogs where user_id = ? and id = ?').bind(userId, id).first<OpdsCatalogRow>();

export const updateCatalog = async (
  db: D1Database,
  userId: string,
  id: string,
  patch: { name: string; url: string; username: string; password_enc: string },
): Promise<boolean> => {
  const res = await db
    .prepare('update opds_catalogs set name = ?, url = ?, username = ?, password_enc = ? where user_id = ? and id = ?')
    .bind(patch.name, patch.url, patch.username, patch.password_enc, userId, id)
    .run();
  return (res.meta.changes ?? 0) > 0;
};

export const deleteCatalog = async (db: D1Database, userId: string, id: string): Promise<boolean> => {
  const res = await db.prepare('delete from opds_catalogs where user_id = ? and id = ?').bind(userId, id).run();
  return (res.meta.changes ?? 0) > 0;
};

export const recordCatalogResult = async (db: D1Database, id: string, ok: boolean, error: string | null, ts: number): Promise<void> => {
  await db
    .prepare(ok ? 'update opds_catalogs set last_ok_at = ?, last_error = null where id = ?' : 'update opds_catalogs set last_error = ? where id = ?')
    .bind(ok ? ts : error, id)
    .run();
};

export const toCatalogDto = (row: OpdsCatalogRow): OpdsCatalogDto => ({
  id: row.id,
  name: row.name,
  url: row.url,
  username: row.username,
  hasCredentials: row.password_enc.length > 0,
  createdAt: row.created_at,
  lastOkAt: row.last_ok_at,
  lastError: row.last_error,
});
