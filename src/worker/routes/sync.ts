import { Hono } from 'hono';
import type { AppEnv } from '../appEnv';
import { ApiError } from '../errors';
import { getSyncSettings, toSyncSettingsDto, upsertSyncSettings } from '../db/syncSettings';
import { listBooksWithProgress } from '../db/books';
import { requireAuth } from '../middleware/requireAuth';
import { encryptString, md5Hex, randomHex } from '../services/crypto';
import { isBlockedHost } from '../services/urlGuard';
import { CrosspointError } from '../sync/crosspointClient';
import { clientFor, getActiveSync, recordOutcome } from '../sync/syncService';
import type { RemoteDocumentDto, SyncSettingsInput } from '../../shared/apiTypes';

export const syncRoutes = new Hono<AppEnv>();
syncRoutes.use('*', requireAuth);

const readJson = async (c: { req: { json: () => Promise<unknown> } }): Promise<Partial<SyncSettingsInput>> => {
  try {
    return (await c.req.json()) as Partial<SyncSettingsInput>;
  } catch {
    throw new ApiError(400, 'validation', 'body must be JSON');
  }
};

const validateInput = (b: Partial<SyncSettingsInput>): SyncSettingsInput => {
  if (typeof b.serverUrl !== 'string' || !/^https?:\/\/[^\s/]+/.test(b.serverUrl)) throw new ApiError(400, 'validation', 'server url must start with http:// or https://');
  let host: string;
  try {
    host = new URL(b.serverUrl).hostname;
  } catch {
    throw new ApiError(400, 'validation', 'invalid server url');
  }
  if (isBlockedHost(host)) throw new ApiError(400, 'validation', 'server url must not point to a private network');
  if (typeof b.username !== 'string' || !/^[A-Za-z0-9._@+-]{1,64}$/.test(b.username)) throw new ApiError(400, 'validation', 'invalid username');
  if (b.hashMethod !== 'partial' && b.hashMethod !== 'filename') throw new ApiError(400, 'validation', 'invalid hash method');
  if (b.password !== undefined && (typeof b.password !== 'string' || b.password.length === 0)) throw new ApiError(400, 'validation', 'invalid password');
  return { enabled: b.enabled === true, serverUrl: b.serverUrl, username: b.username, hashMethod: b.hashMethod, ...(b.password !== undefined ? { password: b.password } : {}) };
};

syncRoutes.get('/settings', async (c) => c.json(toSyncSettingsDto(await getSyncSettings(c.env.DB, c.var.user.id))));

syncRoutes.put('/settings', async (c) => {
  const input = validateInput(await readJson(c));
  const existing = await getSyncSettings(c.env.DB, c.var.user.id);
  if (!input.password && !existing?.auth_key_enc) throw new ApiError(400, 'validation', 'password required for first setup');
  const authKeyEnc = input.password ? await encryptString(await md5Hex(input.password), c.env.SYNC_ENC_KEY) : existing!.auth_key_enc;
  await upsertSyncSettings(c.env.DB, {
    user_id: c.var.user.id,
    server_url: input.serverUrl.replace(/\/+$/, ''),
    username: input.username,
    auth_key_enc: authKeyEnc,
    hash_method: input.hashMethod,
    device_name: existing?.device_name ?? 'Spinecast',
    device_id: existing?.device_id ?? `spinecast-${randomHex(4)}`,
    enabled: input.enabled ? 1 : 0,
    last_ok_at: existing?.last_ok_at ?? null,
    last_error: null,
  });
  return c.json(toSyncSettingsDto(await getSyncSettings(c.env.DB, c.var.user.id)));
});

syncRoutes.post('/test', async (c) => {
  const row = await getSyncSettings(c.env.DB, c.var.user.id);
  if (!row) throw new ApiError(400, 'not_configured', 'sync not configured');
  const client = await clientFor(c.env, row);
  try {
    await client.auth();
  } catch (e) {
    await recordOutcome(c.env, c.var.user.id, e);
    const kind = e instanceof CrosspointError ? e.kind : 'network';
    throw new ApiError(502, `sync_${kind}`, e instanceof Error ? e.message : 'sync server unreachable');
  }
  await recordOutcome(c.env, c.var.user.id, null);
  return c.json({ ok: true });
});

syncRoutes.get('/remote-documents', async (c) => {
  const active = await getActiveSync(c.env, c.var.user.id);
  if (!active) throw new ApiError(400, 'not_configured', 'sync not enabled');
  let items;
  try {
    items = await active.client.listProgress(500);
  } catch (e) {
    await recordOutcome(c.env, c.var.user.id, e);
    const kind = e instanceof CrosspointError ? e.kind : 'network';
    throw new ApiError(502, `sync_${kind}`, e instanceof Error ? e.message : 'sync server unreachable');
  }
  const books = await listBooksWithProgress(c.env.DB, c.var.user.id);
  const byHash = new Map<string, string>();
  for (const b of books) {
    byHash.set(b.hashPartial, b.id);
    byHash.set(b.hashFilename, b.id);
  }
  const out: RemoteDocumentDto[] = items.map((i) => ({
    document: i.document, title: i.title, author: i.author, filename: i.filename, percentage: i.percentage, progress: i.progress,
    deviceId: i.device_id, device: i.device, timestamp: i.timestamp, bookId: byHash.get(i.document) ?? null,
  }));
  return c.json({ items: out });
});
