import type { HashMethod, SyncSettingsDto } from '../../shared/apiTypes';

export interface SyncSettingsRow {
  user_id: string;
  server_url: string;
  username: string;
  auth_key_enc: string;
  hash_method: HashMethod;
  device_name: string;
  device_id: string;
  enabled: number;
  last_ok_at: number | null;
  last_error: string | null;
}

export const getSyncSettings = (db: D1Database, userId: string): Promise<SyncSettingsRow | null> =>
  db.prepare('select * from sync_settings where user_id = ?').bind(userId).first<SyncSettingsRow>();

export const upsertSyncSettings = async (db: D1Database, row: SyncSettingsRow): Promise<void> => {
  await db
    .prepare(
      `insert into sync_settings (user_id, server_url, username, auth_key_enc, hash_method, device_name, device_id, enabled, last_ok_at, last_error)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       on conflict(user_id) do update set server_url = excluded.server_url, username = excluded.username,
         auth_key_enc = excluded.auth_key_enc, hash_method = excluded.hash_method, device_name = excluded.device_name,
         enabled = excluded.enabled, last_ok_at = excluded.last_ok_at, last_error = excluded.last_error`,
    )
    .bind(row.user_id, row.server_url, row.username, row.auth_key_enc, row.hash_method, row.device_name, row.device_id, row.enabled, row.last_ok_at, row.last_error)
    .run();
};

export const recordSyncResult = async (db: D1Database, userId: string, ok: boolean, error: string | null, ts: number): Promise<void> => {
  await db
    .prepare(ok ? 'update sync_settings set last_ok_at = ?, last_error = null where user_id = ?' : 'update sync_settings set last_error = ? where user_id = ?')
    .bind(ok ? ts : error, userId)
    .run();
};

export const toSyncSettingsDto = (row: SyncSettingsRow | null): SyncSettingsDto =>
  row
    ? {
        enabled: row.enabled === 1,
        serverUrl: row.server_url,
        username: row.username,
        hasCredentials: row.auth_key_enc.length > 0,
        hashMethod: row.hash_method,
        lastOkAt: row.last_ok_at,
        lastError: row.last_error,
      }
    : { enabled: false, serverUrl: '', username: '', hasCredentials: false, hashMethod: 'partial', lastOkAt: null, lastError: null };
