import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { app } from '../app';
import { createUserAndLogin, jsonRequest } from '../../../test/helpers';

describe('admin overview', () => {
  it.each([
    ['GET', '/api/admin/overview'],
    ['POST', '/api/admin/overview/cleanup'],
  ] as const)('%s %s requires an admin', async (method, path) => {
    const plain = await createUserAndLogin(env);
    expect((await app.request(...jsonRequest(path, method, undefined), env)).status).toBe(401);
    const denied = await app.request(...jsonRequest(path, method, undefined, plain.cookie), env);
    expect(denied.status).toBe(403);
    expect((await denied.json()).error.code).toBe('forbidden');
  });

  it('returns the overview with exactly the six documented fields and no storage metadata', async () => {
    const admin = await createUserAndLogin(env, { role: 'admin' });
    const res = await app.request(...jsonRequest('/api/admin/overview', 'GET', undefined, admin.cookie), env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(
      ['blobBytes', 'blobs', 'books', 'orphanBlobRows', 'orphanObjects', 'users'].sort(),
    );
    for (const value of Object.values(body)) expect(typeof value).toBe('number');
  });

  it('runs cleanup and returns exactly the two documented count fields', async () => {
    const admin = await createUserAndLogin(env, { role: 'admin' });
    const res = await app.request(...jsonRequest('/api/admin/overview/cleanup', 'POST', undefined, admin.cookie), env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(['deletedObjects', 'deletedRows'].sort());
    expect(typeof body.deletedRows).toBe('number');
    expect(typeof body.deletedObjects).toBe('number');
  });
});
