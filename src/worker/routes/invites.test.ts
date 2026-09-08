import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { app } from '../app';
import { createUser, createUserAndLogin, jsonRequest } from '../../../test/helpers';
import { findInvite, markInviteUsed } from '../db/invites';

describe('invites', () => {
  it('lets an admin create and list invites', async () => {
    const { cookie } = await createUserAndLogin(env, { role: 'admin' });
    const created = await app.request(...jsonRequest('/api/invites', 'POST', {}, cookie), env);
    expect(created.status).toBe(201);
    const invite = await created.json();
    expect(invite.code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(invite.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000) + 6 * 86400);
    expect(invite.usedByEmail).toBeNull();
    const list = await app.request(...jsonRequest('/api/invites', 'GET', undefined, cookie), env);
    expect((await list.json()).items.map((i: { code: string }) => i.code)).toContain(invite.code);
  });

  it('resolves the redeemer email in the list', async () => {
    const { cookie, user: admin } = await createUserAndLogin(env, { role: 'admin' });
    const recipient = await createUser(env);
    const made = await app.request(...jsonRequest('/api/invites', 'POST', {}, cookie), env);
    const { code } = await made.json();
    await markInviteUsed(env.DB, code, recipient.id);
    const list = await app.request(...jsonRequest('/api/invites', 'GET', undefined, cookie), env);
    const items = (await list.json()).items as { code: string; usedByEmail: string | null }[];
    const item = items.find((i) => i.code === code);
    expect(item?.usedByEmail).toBe(recipient.email);
    expect(admin.role).toBe('admin');
  });

  it('forbids non-admins', async () => {
    const { cookie } = await createUserAndLogin(env, { role: 'user' });
    const res = await app.request(...jsonRequest('/api/invites', 'POST', {}, cookie), env);
    expect(res.status).toBe(403);
  });

  it('forbids non-admins from listing or revoking', async () => {
    const { cookie } = await createUserAndLogin(env, { role: 'user' });
    const list = await app.request(...jsonRequest('/api/invites', 'GET', undefined, cookie), env);
    expect(list.status).toBe(403);
    const del = await app.request(...jsonRequest('/api/invites/AAAA-BBBB', 'DELETE', undefined, cookie), env);
    expect(del.status).toBe(403);
  });

  it('revokes an unused invite', async () => {
    const { cookie } = await createUserAndLogin(env, { role: 'admin' });
    const made = await app.request(...jsonRequest('/api/invites', 'POST', {}, cookie), env);
    const { code } = await made.json();
    const res = await app.request(...jsonRequest(`/api/invites/${code}`, 'DELETE', undefined, cookie), env);
    expect(res.status).toBe(204);
    expect(await findInvite(env.DB, code)).toBeNull();
  });

  it('revokes an expired but unused invite', async () => {
    const { cookie } = await createUserAndLogin(env, { role: 'admin' });
    const made = await app.request(...jsonRequest('/api/invites', 'POST', {}, cookie), env);
    const { code } = await made.json();
    await env.DB.prepare('update invites set expires_at = ? where code = ?').bind(1, code).run();
    const res = await app.request(...jsonRequest(`/api/invites/${code}`, 'DELETE', undefined, cookie), env);
    expect(res.status).toBe(204);
    expect(await findInvite(env.DB, code)).toBeNull();
  });

  it('does not revoke a used invite', async () => {
    const { cookie } = await createUserAndLogin(env, { role: 'admin' });
    const recipient = await createUser(env);
    const made = await app.request(...jsonRequest('/api/invites', 'POST', {}, cookie), env);
    const { code } = await made.json();
    await markInviteUsed(env.DB, code, recipient.id);
    const res = await app.request(...jsonRequest(`/api/invites/${code}`, 'DELETE', undefined, cookie), env);
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe('invite_used');
    expect(await findInvite(env.DB, code)).not.toBeNull();
  });

  it('does not let another admin revoke a code they did not create', async () => {
    const { cookie: cookieA } = await createUserAndLogin(env, { role: 'admin' });
    const { cookie: cookieB } = await createUserAndLogin(env, { role: 'admin' });
    const made = await app.request(...jsonRequest('/api/invites', 'POST', {}, cookieA), env);
    const { code } = await made.json();
    const res = await app.request(...jsonRequest(`/api/invites/${code}`, 'DELETE', undefined, cookieB), env);
    expect(res.status).toBe(404);
    expect(await findInvite(env.DB, code)).not.toBeNull();
  });

  it('does not leak that a used invite created by another admin exists', async () => {
    const { cookie: cookieA } = await createUserAndLogin(env, { role: 'admin' });
    const { cookie: cookieB } = await createUserAndLogin(env, { role: 'admin' });
    const recipient = await createUser(env);
    const made = await app.request(...jsonRequest('/api/invites', 'POST', {}, cookieA), env);
    const { code } = await made.json();
    await markInviteUsed(env.DB, code, recipient.id);
    const res = await app.request(...jsonRequest(`/api/invites/${code}`, 'DELETE', undefined, cookieB), env);
    expect(res.status).toBe(404);
  });

  it('returns 404 for an unknown code', async () => {
    const { cookie } = await createUserAndLogin(env, { role: 'admin' });
    const res = await app.request(...jsonRequest('/api/invites/ZZZZ-ZZZZ', 'DELETE', undefined, cookie), env);
    expect(res.status).toBe(404);
  });
});
