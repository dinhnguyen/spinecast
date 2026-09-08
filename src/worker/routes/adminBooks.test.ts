import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createUserAndLogin, jsonRequest } from '../../../test/helpers';
import { app } from '../app';

describe('admin books route', () => {
  it('requires an admin', async () => {
    const plain = await createUserAndLogin(env);
    expect((await app.request(...jsonRequest('/api/admin/books', 'GET'), env)).status).toBe(401);
    const denied = await app.request(...jsonRequest('/api/admin/books', 'GET', undefined, plain.cookie), env);
    expect(denied.status).toBe(403);
  });

  it('defaults to size sort and rejects an unknown sort', async () => {
    const admin = await createUserAndLogin(env, { role: 'admin' });
    const ok = await app.request(...jsonRequest('/api/admin/books', 'GET', undefined, admin.cookie), env);
    expect(ok.status).toBe(200);
    const body = await ok.json();
    expect(Array.isArray(body.items)).toBe(true);
    expect('nextCursor' in body).toBe(true);
    const invalid = await app.request(...jsonRequest('/api/admin/books?sort=title', 'GET', undefined, admin.cookie), env);
    expect(invalid.status).toBe(400);
  });
});
