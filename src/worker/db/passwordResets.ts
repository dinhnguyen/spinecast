import type { ResetCodeDto } from '../../shared/apiTypes';
import { randomHex, sha256Hex } from '../services/crypto';
import type { UserRow } from './users';

export interface PasswordResetRow {
  code_hash: string;
  user_id: string;
  created_by: string;
  expires_at: number;
  created_at: number;
  used_at: number | null;
}

const RESET_TTL_SECONDS = 86400;

export const findPasswordReset = (db: D1Database, codeHash: string): Promise<PasswordResetRow | null> =>
  db.prepare('select * from password_resets where code_hash = ?').bind(codeHash).first<PasswordResetRow>();

export const issuePasswordReset = async (
  db: D1Database,
  userId: string,
  createdBy: string,
  now: number,
): Promise<ResetCodeDto> => {
  const code = randomHex(16);
  const codeHash = await sha256Hex(code);
  const expiresAt = now + RESET_TTL_SECONDS;
  await db.batch([
    db.prepare('delete from password_resets where user_id = ? and used_at is null').bind(userId),
    db.prepare(
      'insert into password_resets (code_hash, user_id, created_by, expires_at, used_at, created_at) values (?, ?, ?, ?, null, ?)',
    ).bind(codeHash, userId, createdBy, expiresAt, now),
  ]);
  return { code, expiresAt };
};

export const consumePasswordReset = async (
  db: D1Database,
  codeHash: string,
  passwordHash: string,
  now: number,
): Promise<UserRow | null> => {
  const result = await db.batch([
    db.prepare(`update users set password_hash = ?1, session_epoch = session_epoch + 1
      where disabled_at is null and id = (
        select user_id from password_resets
        where code_hash = ?2 and used_at is null and expires_at > ?3
      ) returning *`).bind(passwordHash, codeHash, now),
    db.prepare(`update password_resets set used_at = ?1
      where code_hash = ?2 and used_at is null and expires_at > ?1
        and changes() = 1`).bind(now, codeHash),
  ]);
  return (result[0]!.results[0] as unknown as UserRow | undefined) ?? null;
};
