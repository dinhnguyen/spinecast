import { Hono } from 'hono';
import type { AppEnv } from '../appEnv';
import { findInvite, insertInvite, listInvites, revokeUnusedInvite, type InviteRow } from '../db/invites';
import { ApiError } from '../errors';
import { requireAdmin, requireAuth } from '../middleware/requireAuth';
import { makeShortCode } from '../services/shortCode';
import type { InviteDto } from '../../shared/apiTypes';

const INVITE_TTL_SECONDS = 7 * 86400;

const toDto = (row: InviteRow & { used_by_email?: string | null }): InviteDto => ({
  code: row.code,
  expiresAt: row.expires_at,
  usedBy: row.used_by,
  usedByEmail: row.used_by_email ?? null,
  createdAt: row.created_at,
});

export const inviteRoutes = new Hono<AppEnv>();
inviteRoutes.use('*', requireAuth, requireAdmin);

inviteRoutes.post('/', async (c) => {
  const now = Math.floor(Date.now() / 1000);
  const row: InviteRow = { code: makeShortCode(), created_by: c.var.user.id, used_by: null, expires_at: now + INVITE_TTL_SECONDS, created_at: now };
  await insertInvite(c.env.DB, row);
  return c.json(toDto(row), 201);
});

inviteRoutes.get('/', async (c) => {
  const rows = await listInvites(c.env.DB, c.var.user.id);
  return c.json({ items: rows.map(toDto) });
});

inviteRoutes.delete('/:code', async (c) => {
  const code = c.req.param('code');
  const invite = await findInvite(c.env.DB, code);
  if (!invite || invite.created_by !== c.var.user.id) throw new ApiError(404, 'not_found', 'invite not found');
  if (invite.used_by !== null) throw new ApiError(409, 'invite_used', 'invite already used');

  const revoked = await revokeUnusedInvite(c.env.DB, c.var.user.id, code);
  if (!revoked) {
    const current = await findInvite(c.env.DB, code);
    if (current && current.used_by !== null) throw new ApiError(409, 'invite_used', 'invite already used');
    throw new ApiError(404, 'not_found', 'invite not found');
  }
  return c.body(null, 204);
});
