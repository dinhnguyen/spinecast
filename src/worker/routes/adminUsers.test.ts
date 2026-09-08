import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { app } from '../app';
import { findBook, insertBook } from '../db/books';
import { insertDevice, listDevices } from '../db/devices';
import { findInvite, insertInvite } from '../db/invites';
import { insertCatalog } from '../db/opdsCatalogs';
import { insertPasskey, listPasskeys } from '../db/passkeys';
import { issuePasswordReset } from '../db/passwordResets';
import { upsertProgress } from '../db/progress';
import { upsertBookmark } from '../db/bookmarks';
import { upsertClipping } from '../db/clippings';
import { insertSession } from '../db/readingSessions';
import { markStatsDirty } from '../db/stats';
import { upsertSyncSettings } from '../db/syncSettings';
import { setCursor } from '../db/syncCursors';
import { findUserById } from '../db/users';
import { randomHex } from '../services/crypto';
import { createOpdsToken, createUser, createUserAndLogin, firstDeviceId, jsonRequest, uploadFixture } from '../../../test/helpers';

const id = (prefix: string): string => `${prefix}-${randomHex(8)}`;

describe('admin users', () => {
  it.each([
    ['GET', '/api/admin/users', undefined],
    ['PATCH', '/api/admin/users/unknown', { disabled: true }],
    ['DELETE', '/api/admin/users/unknown', undefined],
    ['POST', '/api/admin/users/unknown/reset-code', {}],
    ['GET', '/api/admin/users/unknown', undefined],
    ['DELETE', '/api/admin/users/unknown/devices/x', undefined],
    ['DELETE', '/api/admin/users/unknown/passkeys/x', undefined],
  ] as const)('%s %s requires an admin', async (method, path, body) => {
    const plain = await createUserAndLogin(env);
    expect((await app.request(...jsonRequest(path, method, body), env)).status).toBe(401);
    const denied = await app.request(...jsonRequest(path, method, body, plain.cookie), env);
    expect(denied.status).toBe(403);
    expect((await denied.json()).error.code).toBe('forbidden');
  });

  it('issues a self reset and returns 404 for missing targets', async () => {
    const admin = await createUserAndLogin(env, { role: 'admin' });
    const self = await app.request(...jsonRequest(`/api/admin/users/${admin.user.id}/reset-code`, 'POST', {}, admin.cookie), env);
    expect(self.status).toBe(201);
    expect(self.headers.get('cache-control')).toBe('no-store');
    expect((await self.json()).code).toMatch(/^[0-9a-f]{32}$/);
    const missing = await app.request(...jsonRequest('/api/admin/users/missing/reset-code', 'POST', {}, admin.cookie), env);
    expect(missing.status).toBe(404);
    expect((await missing.json()).error.code).toBe('not_found');
  });

  it('lists aggregate user data without multiplying joined children or leaking credentials', async () => {
    const admin = await createUserAndLogin(env, { role: 'admin' });
    const target = await createUserAndLogin(env);
    const empty = await createUser(env);
    const firstBook = await uploadFixture(env, target.cookie, `${id('first')}.epub`);
    const secondBookSize = firstBook.filesize + 7;
    await insertBook(env.DB, {
      id: id('book'), user_id: target.user.id, title: 'Second', author: 'Test', filename: 'second.epub', filesize: secondBookSize,
      r2_key: id('r2'), cover_r2_key: null, shared: 0, hash_partial: id('partial'), hash_filename: id('filename'),
      created_at: 2, last_opened_at: null, source_catalog_id: null, source_entry_id: null,
    });
    const latestSeenAt = Math.floor(Date.now() / 1000) + 1000;
    await Promise.all([
      insertDevice(env.DB, { id: id('device'), user_id: target.user.id, name: 'Phone', created_at: 2, last_seen_at: latestSeenAt }),
      insertPasskey(env.DB, { id: id('passkey'), user_id: target.user.id, public_key: 'key-a', counter: 0, transports: 'internal', name: 'Laptop', created_at: 1, last_used_at: null }),
      insertPasskey(env.DB, { id: id('passkey'), user_id: target.user.id, public_key: 'key-b', counter: 0, transports: 'internal', name: 'Phone', created_at: 2, last_used_at: null }),
    ]);

    const response = await app.request(...jsonRequest('/api/admin/users', 'GET', undefined, admin.cookie), env);
    expect(response.status).toBe(200);
    const { items } = await response.json() as { items: Array<Record<string, unknown>> };
    const listed = items.find((item) => item.id === target.user.id)!;
    expect(listed).toMatchObject({
      id: target.user.id,
      email: target.user.email,
      role: 'user',
      disabledAt: null,
      bookCount: 2,
      bytesUsed: firstBook.filesize + secondBookSize,
      passkeyCount: 2,
      lastSeenAt: latestSeenAt,
    });
    expect(listed).not.toHaveProperty('password_hash');
    expect(listed).not.toHaveProperty('session_epoch');
    const noChildren = items.find((item) => item.id === empty.id)!;
    expect(noChildren).toMatchObject({ bookCount: 0, bytesUsed: 0, passkeyCount: 0, lastSeenAt: null });
    expect(items.map((item) => item.id)).toEqual(expect.arrayContaining([admin.user.id, target.user.id, empty.id]));
  });

  it('lists users oldest first and breaks equal creation timestamps by id', async () => {
    const admin = await createUserAndLogin(env, { role: 'admin' });
    const oldest = await createUser(env);
    const tiedA = await createUser(env);
    const tiedB = await createUser(env);
    await Promise.all([
      env.DB.prepare('update users set created_at = ? where id = ?').bind(100, oldest.id).run(),
      env.DB.prepare('update users set created_at = ? where id = ?').bind(200, tiedA.id).run(),
      env.DB.prepare('update users set created_at = ? where id = ?').bind(200, tiedB.id).run(),
    ]);

    const response = await app.request(...jsonRequest('/api/admin/users', 'GET', undefined, admin.cookie), env);
    expect(response.status).toBe(200);
    const { items } = await response.json() as { items: Array<{ id: string }> };
    const ids = new Set([oldest.id, tiedA.id, tiedB.id]);
    expect(items.filter((item) => ids.has(item.id)).map((item) => item.id)).toEqual([
      oldest.id,
      ...[tiedA.id, tiedB.id].sort(),
    ]);
  });

  it('strictly validates and applies role and lock changes without allowing self changes', async () => {
    const admin = await createUserAndLogin(env, { role: 'admin' });
    const target = await createUser(env);
    const otherAdmin = await createUser(env, { role: 'admin' });
    const patch = async (userId: string, body: unknown) =>
      app.request(...jsonRequest(`/api/admin/users/${userId}`, 'PATCH', body, admin.cookie), env);

    for (const body of [null, [], {}, { role: 'root' }, { disabled: 1 }, { role: 'user', disabled: false }, { role: 'user', extra: true }]) {
      const response = await patch(target.id, body);
      expect(response.status).toBe(400);
      expect((await response.json()).error.code).toBe('validation');
    }
    const malformed = await app.request(`/api/admin/users/${target.id}`, {
      method: 'PATCH', headers: { 'content-type': 'application/json', cookie: admin.cookie }, body: '{',
    }, env);
    expect(malformed.status).toBe(400);
    expect((await malformed.json()).error.code).toBe('validation');
    for (const body of [{ role: 'user' }, { disabled: true }, { disabled: false }]) {
      const response = await patch(admin.user.id, body);
      expect(response.status).toBe(409);
      expect((await response.json()).error.code).toBe('self_action');
    }
    expect((await patch(id('missing'), { disabled: true })).status).toBe(404);

    const changedRole = await patch(otherAdmin.id, { role: 'user' });
    expect(changedRole.status).toBe(200);
    expect((await changedRole.json()).role).toBe('user');
    const locked = await patch(target.id, { disabled: true });
    expect(locked.status).toBe(200);
    expect((await locked.json()).disabledAt).toBeTruthy();
    const lockedRow = await env.DB.prepare('select disabled_at, session_epoch from users where id = ?').bind(target.id).first<{ disabled_at: number | null; session_epoch: number }>();
    expect(lockedRow).toMatchObject({ session_epoch: 1 });
    expect(lockedRow!.disabled_at).not.toBeNull();
    const unlocked = await patch(target.id, { disabled: false });
    expect(unlocked.status).toBe(200);
    expect((await unlocked.json()).disabledAt).toBeNull();
    expect(await env.DB.prepare('select session_epoch from users where id = ?').bind(target.id).first<{ session_epoch: number }>()).toEqual({ session_epoch: 1 });
  });

  it('rejects deleting yourself and 404s for a missing target', async () => {
    const admin = await createUserAndLogin(env, { role: 'admin' });
    const self = await app.request(...jsonRequest(`/api/admin/users/${admin.user.id}`, 'DELETE', undefined, admin.cookie), env);
    expect(self.status).toBe(409);
    expect((await self.json()).error.code).toBe('self_action');
    const missing = await app.request(...jsonRequest(`/api/admin/users/${id('missing')}`, 'DELETE', undefined, admin.cookie), env);
    expect(missing.status).toBe(404);
    expect((await missing.json()).error.code).toBe('not_found');
  });

  it('removes one user without deleting another user shared book', async () => {
    const admin = await createUserAndLogin(env, { role: 'admin' });
    const a = await createUserAndLogin(env);
    const b = await createUserAndLogin(env);
    const bookA = await uploadFixture(env, a.cookie);
    const bookB = await uploadFixture(env, b.cookie);
    const rowB = (await findBook(env.DB, b.user.id, bookB.id))!;
    const res = await app.request(...jsonRequest(`/api/admin/users/${a.user.id}`, 'DELETE', undefined, admin.cookie), env);
    expect(res.status).toBe(204);
    expect(await findUserById(env.DB, a.user.id)).toBeNull();
    expect(await findBook(env.DB, a.user.id, bookA.id)).toBeNull();
    expect(await env.BOOKS.head(rowB.r2_key)).not.toBeNull();
    expect((await app.request(...jsonRequest(`/api/books/${bookB.id}/file`, 'GET', undefined, b.cookie), env)).status).toBe(200);
    expect((await app.request(...jsonRequest('/api/auth/me', 'GET', undefined, a.cookie), env)).status).toBe(401);
  });

  it('cleans up every foreign-key-referencing table for the deleted user without touching other rows', async () => {
    const admin = await createUserAndLogin(env, { role: 'admin' });
    const target = await createUserAndLogin(env);
    const other = await createUser(env);

    const inviteFromAdmin = id('invite');
    await insertInvite(env.DB, { code: inviteFromAdmin, created_by: admin.user.id, used_by: target.user.id, expires_at: 9999999999, created_at: 1 });
    const inviteFromTarget = id('invite');
    await insertInvite(env.DB, { code: inviteFromTarget, created_by: target.user.id, used_by: null, expires_at: 9999999999, created_at: 1 });

    // target as reset recipient (user_id) and as reset creator (created_by)
    await issuePasswordReset(env.DB, target.user.id, admin.user.id, 1);
    await issuePasswordReset(env.DB, other.id, target.user.id, 1);

    const bookId = id('book');
    await insertBook(env.DB, {
      id: bookId, user_id: target.user.id, title: 'T', author: 'A', filename: 'f.epub', filesize: 10,
      r2_key: id('r2'), cover_r2_key: null, shared: 0, hash_partial: id('partial'), hash_filename: id('filename'),
      blob_hash: null, created_at: 1, last_opened_at: null, source_catalog_id: null, source_entry_id: null,
    });
    await upsertProgress(env.DB, bookId, { pctQ: 1000, spine: 0 }, 1, null);
    await upsertBookmark(env.DB, { id: id('bm'), book_id: bookId, xpath: '/x', percentage: 0.5, summary: null, si: null, pc: null, pp: null, chapter: null, deleted: 0, updated_at: 1, dirty: 1 });
    await upsertClipping(env.DB, { id: id('cl'), book_id: bookId, spine: null, start_page: null, end_page: null, pages: null, start_word: null, end_word: null, words: null, para: null, chapter: null, text: 'hi', note: null, color: null, cfi: null, created_at: 1, deleted: 0, updated_at: 1, dirty: 1 });
    await markStatsDirty(env.DB, target.user.id, bookId);

    await insertDevice(env.DB, { id: id('device'), user_id: target.user.id, name: 'D', created_at: 1, last_seen_at: 1 });
    await insertPasskey(env.DB, { id: id('pk'), user_id: target.user.id, public_key: 'k', counter: 0, transports: '', name: 'n', created_at: 1, last_used_at: null });
    await createOpdsToken(env, target.user.id, 'library');
    await insertCatalog(env.DB, { id: id('cat'), user_id: target.user.id, name: 'C', url: 'https://example.test', username: '', password_enc: '', created_at: 1, last_ok_at: null, last_error: null });
    await upsertSyncSettings(env.DB, { user_id: target.user.id, server_url: 'https://example.test', username: 'u', auth_key_enc: '', hash_method: 'partial', device_name: 'D', device_id: 'd1', enabled: 1, last_ok_at: null, last_error: null });
    await setCursor(env.DB, target.user.id, bookId, 'bookmarks', 5);
    await insertSession(env.DB, { id: id('session'), user_id: target.user.id, book_id: bookId, started_at: 1, ended_at: 2, seconds: 1, pages: 1, device_id: null });

    const res = await app.request(...jsonRequest(`/api/admin/users/${target.user.id}`, 'DELETE', undefined, admin.cookie), env);
    expect(res.status).toBe(204);

    expect(await findUserById(env.DB, target.user.id)).toBeNull();
    expect(await findInvite(env.DB, inviteFromAdmin)).toMatchObject({ used_by: null });
    expect(await findInvite(env.DB, inviteFromTarget)).toBeNull();

    const countByTarget = async (table: string, column = 'user_id') =>
      (await env.DB.prepare(`select count(*) as n from ${table} where ${column} = ?`).bind(target.user.id).first<{ n: number }>())!.n;

    expect(await countByTarget('password_resets', 'user_id')).toBe(0);
    expect(await countByTarget('password_resets', 'created_by')).toBe(0);
    expect(await countByTarget('devices')).toBe(0);
    expect(await countByTarget('passkeys')).toBe(0);
    expect(await countByTarget('opds_tokens')).toBe(0);
    expect(await countByTarget('opds_catalogs')).toBe(0);
    expect(await countByTarget('sync_settings')).toBe(0);
    expect(await countByTarget('sync_cursors')).toBe(0);
    expect(await countByTarget('reading_sessions')).toBe(0);
    expect(await countByTarget('global_stats')).toBe(0);

    const countByBook = async (table: string) =>
      (await env.DB.prepare(`select count(*) as n from ${table} where book_id = ?`).bind(bookId).first<{ n: number }>())!.n;
    expect(await countByBook('reading_progress')).toBe(0);
    expect(await countByBook('bookmarks')).toBe(0);
    expect(await countByBook('clippings')).toBe(0);
    expect(await countByBook('book_stats')).toBe(0);
    expect((await env.DB.prepare('select count(*) as n from books where id = ?').bind(bookId).first<{ n: number }>())!.n).toBe(0);
  });

  it('returns detail with devices and passkeys, and 404s for unknown ids', async () => {
    const admin = await createUserAndLogin(env, { role: 'admin' });
    const target = await createUserAndLogin(env);
    const passkeyId = id('pk');
    await insertPasskey(env.DB, {
      id: passkeyId,
      user_id: target.user.id,
      public_key: 'pk',
      counter: 0,
      transports: '[]',
      name: 'Laptop',
      created_at: 1,
      last_used_at: null,
    });
    const res = await app.request(...jsonRequest(`/api/admin/users/${target.user.id}`, 'GET', undefined, admin.cookie), env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.email).toBe(target.user.email);
    expect(body.devices).toHaveLength(1);
    expect(body.devices[0]).toMatchObject({ name: expect.any(String), current: false });
    expect(body.passkeys).toEqual([{ id: passkeyId, name: 'Laptop', createdAt: 1, lastUsedAt: null }]);
    expect((await app.request(...jsonRequest('/api/admin/users/nope', 'GET', undefined, admin.cookie), env)).status).toBe(404);
  });

  it('revoking a device logs that device out and 404s for another user device', async () => {
    const admin = await createUserAndLogin(env, { role: 'admin' });
    const target = await createUserAndLogin(env);
    const other = await createUserAndLogin(env);
    const deviceId = await firstDeviceId(env, target.user.id);
    const wrong = await app.request(...jsonRequest(`/api/admin/users/${other.user.id}/devices/${deviceId}`, 'DELETE', undefined, admin.cookie), env);
    expect(wrong.status).toBe(404);
    expect((await app.request(...jsonRequest('/api/auth/me', 'GET', undefined, target.cookie), env)).status).toBe(200);
    const res = await app.request(...jsonRequest(`/api/admin/users/${target.user.id}/devices/${deviceId}`, 'DELETE', undefined, admin.cookie), env);
    expect(res.status).toBe(204);
    expect((await app.request(...jsonRequest('/api/auth/me', 'GET', undefined, target.cookie), env)).status).toBe(401);
  });

  it('allows an admin to revoke their own current device', async () => {
    const admin = await createUserAndLogin(env, { role: 'admin' });
    const deviceId = await firstDeviceId(env, admin.user.id);
    const res = await app.request(...jsonRequest(`/api/admin/users/${admin.user.id}/devices/${deviceId}`, 'DELETE', undefined, admin.cookie), env);
    expect(res.status).toBe(204);
    expect(await listDevices(env.DB, admin.user.id)).toHaveLength(0);
  });

  it('removing a passkey leaves sessions alive and 404s for another user passkey', async () => {
    const admin = await createUserAndLogin(env, { role: 'admin' });
    const target = await createUserAndLogin(env);
    const other = await createUserAndLogin(env);
    const passkeyId = id('pk');
    await insertPasskey(env.DB, {
      id: passkeyId,
      user_id: target.user.id,
      public_key: 'pk',
      counter: 0,
      transports: '[]',
      name: 'Phone',
      created_at: 1,
      last_used_at: null,
    });
    expect((await app.request(...jsonRequest(`/api/admin/users/${other.user.id}/passkeys/${passkeyId}`, 'DELETE', undefined, admin.cookie), env)).status).toBe(404);
    const res = await app.request(...jsonRequest(`/api/admin/users/${target.user.id}/passkeys/${passkeyId}`, 'DELETE', undefined, admin.cookie), env);
    expect(res.status).toBe(204);
    expect(await listPasskeys(env.DB, target.user.id)).toHaveLength(0);
    expect((await app.request(...jsonRequest('/api/auth/me', 'GET', undefined, target.cookie), env)).status).toBe(200);
  });
});
