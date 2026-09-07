import { Hono } from 'hono';
import type { AppEnv } from '../appEnv';
import { insertInvite, listInvites, type InviteRow } from '../db/invites';
import { requireAdmin, requireAuth } from '../middleware/requireAuth';
import type { InviteDto } from '../../shared/apiTypes';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const INVITE_TTL_SECONDS = 7 * 86400;

const makeCode = (): string => {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  const chars = [...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join('');
  return `${chars.slice(0, 4)}-${chars.slice(4)}`;
};

const toDto = (row: InviteRow): InviteDto => ({
  code: row.code,
  expiresAt: row.expires_at,
  usedBy: row.used_by,
  createdAt: row.created_at,
});

export const inviteRoutes = new Hono<AppEnv>();
inviteRoutes.use('*', requireAuth, requireAdmin);

inviteRoutes.post('/', async (c) => {
  const now = Math.floor(Date.now() / 1000);
  const row: InviteRow = { code: makeCode(), created_by: c.var.user.id, used_by: null, expires_at: now + INVITE_TTL_SECONDS, created_at: now };
  await insertInvite(c.env.DB, row);
  return c.json(toDto(row), 201);
});

inviteRoutes.get('/', async (c) => {
  const rows = await listInvites(c.env.DB, c.var.user.id);
  return c.json({ items: rows.map(toDto) });
});
