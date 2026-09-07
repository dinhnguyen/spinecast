import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { app } from '../app';
import { createUserAndLogin, jsonRequest } from '../../../test/helpers';

describe('invites', () => {
  it('lets an admin create and list invites', async () => {
    const { cookie } = await createUserAndLogin(env, { role: 'admin' });
    const created = await app.request(...jsonRequest('/api/invites', 'POST', {}, cookie), env);
    expect(created.status).toBe(201);
    const invite = await created.json();
    expect(invite.code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    expect(invite.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000) + 6 * 86400);
    const list = await app.request(...jsonRequest('/api/invites', 'GET', undefined, cookie), env);
    expect((await list.json()).items.map((i: { code: string }) => i.code)).toContain(invite.code);
  });

  it('forbids non-admins', async () => {
    const { cookie } = await createUserAndLogin(env, { role: 'user' });
    const res = await app.request(...jsonRequest('/api/invites', 'POST', {}, cookie), env);
    expect(res.status).toBe(403);
  });
});
