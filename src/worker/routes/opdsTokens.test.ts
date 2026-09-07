import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { app } from '../app';
import { basicAuth, createUserAndLogin, jsonRequest, uploadFixture } from '../../../test/helpers';

describe('opds token routes', () => {
  it('reports no tokens, creates one per scope, returns plaintext once', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    const empty = await app.request(...jsonRequest('/api/opds/tokens', 'GET', undefined, cookie), env);
    expect(await empty.json()).toEqual({ library: null, public: null, sharedCount: 0 });

    const created = await app.request(...jsonRequest('/api/opds/tokens/library', 'POST', undefined, cookie), env);
    expect(created.status).toBe(201);
    const body = await created.json();
    expect(body.scope).toBe('library');
    expect(body.token).toMatch(/^[a-z2-7]{24}$/);
    expect(body.url).toBe(`http://localhost/opds/${user.id}/library`);

    const listed = await app.request(...jsonRequest('/api/opds/tokens', 'GET', undefined, cookie), env);
    const dto = await listed.json();
    expect(dto.library.createdAt).toBeGreaterThan(0);
    expect(dto.library.lastUsedAt).toBeNull();
    expect(dto.public).toBeNull();
    expect(JSON.stringify(dto)).not.toContain(body.token);

    const feed = await app.request(`http://localhost/opds/${user.id}/library`, { headers: basicAuth(body.token) }, env);
    expect(feed.status).toBe(200);
  });

  it('regenerating invalidates the old token and revoking removes access', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    const first = (await (await app.request(...jsonRequest('/api/opds/tokens/public', 'POST', undefined, cookie), env)).json()).token;
    const second = (await (await app.request(...jsonRequest('/api/opds/tokens/public', 'POST', undefined, cookie), env)).json()).token;
    expect(second).not.toBe(first);
    const root = `http://localhost/opds/${user.id}/public`;
    expect((await app.request(root, { headers: basicAuth(first) }, env)).status).toBe(401);
    expect((await app.request(root, { headers: basicAuth(second) }, env)).status).toBe(200);
    const del = await app.request(...jsonRequest('/api/opds/tokens/public', 'DELETE', undefined, cookie), env);
    expect(del.status).toBe(204);
    expect((await app.request(root, { headers: basicAuth(second) }, env)).status).toBe(401);
    expect((await (await app.request(...jsonRequest('/api/opds/tokens', 'GET', undefined, cookie), env)).json()).public).toBeNull();
  });

  it('counts shared books and rejects unknown scopes and anonymous calls', async () => {
    const { cookie } = await createUserAndLogin(env);
    const book = await uploadFixture(env, cookie);
    await app.request(...jsonRequest(`/api/books/${book.id}`, 'PATCH', { shared: true }, cookie), env);
    expect((await (await app.request(...jsonRequest('/api/opds/tokens', 'GET', undefined, cookie), env)).json()).sharedCount).toBe(1);
    expect((await app.request(...jsonRequest('/api/opds/tokens/other', 'POST', undefined, cookie), env)).status).toBe(404);
    expect((await app.request(...jsonRequest('/api/opds/tokens', 'GET'), env)).status).toBe(401);
  });
});
