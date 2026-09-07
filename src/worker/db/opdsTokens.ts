import type { OpdsScope } from '../../shared/apiTypes';

export const OPDS_SCOPES: readonly OpdsScope[] = ['library', 'public'];

export const isOpdsScope = (s: string): s is OpdsScope => (OPDS_SCOPES as readonly string[]).includes(s);

export interface OpdsTokenRow {
  user_id: string;
  scope: OpdsScope;
  token_hash: string;
  created_at: number;
  last_used_at: number | null;
}

export const findOpdsToken = (db: D1Database, userId: string, scope: OpdsScope): Promise<OpdsTokenRow | null> =>
  db.prepare('select * from opds_tokens where user_id = ? and scope = ?').bind(userId, scope).first<OpdsTokenRow>();

export const upsertOpdsToken = async (db: D1Database, userId: string, scope: OpdsScope, tokenHash: string, now: number): Promise<void> => {
  await db
    .prepare(
      `insert into opds_tokens (user_id, scope, token_hash, created_at, last_used_at) values (?, ?, ?, ?, null)
       on conflict (user_id, scope) do update set token_hash = excluded.token_hash, created_at = excluded.created_at, last_used_at = null`,
    )
    .bind(userId, scope, tokenHash, now)
    .run();
};

export const deleteOpdsToken = async (db: D1Database, userId: string, scope: OpdsScope): Promise<void> => {
  await db.prepare('delete from opds_tokens where user_id = ? and scope = ?').bind(userId, scope).run();
};

export const touchOpdsToken = async (db: D1Database, userId: string, scope: OpdsScope, now: number): Promise<void> => {
  await db.prepare('update opds_tokens set last_used_at = ? where user_id = ? and scope = ?').bind(now, userId, scope).run();
};
