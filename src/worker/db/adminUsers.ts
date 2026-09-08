import type { AdminUserDto, AdminUserPatch } from '../../shared/apiTypes';

const SELECT_ADMIN_USERS = `select u.id, u.email, u.role, u.created_at as createdAt, u.disabled_at as disabledAt,
       coalesce(b.bookCount, 0) as bookCount, coalesce(b.bytesUsed, 0) as bytesUsed,
       coalesce(p.passkeyCount, 0) as passkeyCount, d.lastSeenAt
from users u
left join (select user_id, count(*) as bookCount, sum(filesize) as bytesUsed
           from books group by user_id) b on b.user_id = u.id
left join (select user_id, count(*) as passkeyCount from passkeys group by user_id) p on p.user_id = u.id
left join (select user_id, max(last_seen_at) as lastSeenAt from devices group by user_id) d on d.user_id = u.id`;

export const listAdminUsers = async (db: D1Database): Promise<AdminUserDto[]> => {
  const result = await db.prepare(`${SELECT_ADMIN_USERS} order by u.created_at asc, u.id asc`).all<AdminUserDto>();
  return result.results;
};

export const getAdminUser = (db: D1Database, id: string): Promise<AdminUserDto | null> =>
  db.prepare(`${SELECT_ADMIN_USERS} where u.id = ?`).bind(id).first<AdminUserDto>();

export const patchAdminUser = async (db: D1Database, id: string, patch: AdminUserPatch, now: number): Promise<void> => {
  if ('role' in patch) {
    await db.prepare('update users set role = ? where id = ?').bind(patch.role, id).run();
  } else if (patch.disabled) {
    await db.prepare('update users set disabled_at = ?, session_epoch = session_epoch + 1 where id = ?').bind(now, id).run();
  } else {
    await db.prepare('update users set disabled_at = null where id = ?').bind(id).run();
  }
};
