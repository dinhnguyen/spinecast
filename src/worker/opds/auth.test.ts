import { env } from 'cloudflare:workers';
import { Hono } from 'hono';
import { describe, expect, it } from 'vitest';
import { createUser } from '../../../test/helpers';
import { findOpdsToken, upsertOpdsToken } from '../db/opdsTokens';
import { hashOpdsToken } from '../services/opdsToken';
import { opdsAuth, OPDS_RATE_LIMIT, type OpdsEnv } from './auth';

const basic = (password: string, username = 'x'): Record<string, string> => ({
  authorization: `Basic ${btoa(`${username}:${password}`)}`,
});

const testApp = new Hono<OpdsEnv>();
testApp.use('/opds/:userId/:scope/*', opdsAuth);
testApp.get('/opds/:userId/:scope/ping', (c) => c.text(`${c.var.opdsUser}:${c.var.opdsScope}:${c.var.opdsBase}`));
testApp.use('/o/:slug/:scope/*', opdsAuth);
testApp.get('/o/:slug/:scope/ping', (c) => c.text(`${c.var.opdsUser}:${c.var.opdsScope}:${c.var.opdsBase}`));

const withToken = async (scope: 'library' | 'public' = 'library') => {
  const u = await createUser(env);
  const token = 'abcdefghijklmnopqrstuvwx';
  // opdsAuth only ever compares against token_hash, so token_enc is irrelevant here.
  await upsertOpdsToken(env.DB, u.id, scope, await hashOpdsToken(token), '', 1);
  return { u, token };
};

describe('opdsAuth', () => {
  it('returns 401 with WWW-Authenticate when the header is missing or malformed', async () => {
    const { u } = await withToken();
    const none = await testApp.request(`/opds/${u.id}/library/ping`, {}, env);
    expect(none.status).toBe(401);
    expect(none.headers.get('www-authenticate')).toBe('Basic realm="Spinecast"');
    const bearer = await testApp.request(`/opds/${u.id}/library/ping`, { headers: { authorization: 'Bearer abc' } }, env);
    expect(bearer.status).toBe(401);
    const junk = await testApp.request(`/opds/${u.id}/library/ping`, { headers: { authorization: 'Basic %%%' } }, env);
    expect(junk.status).toBe(401);
  });

  it('accepts the right token and ignores the username', async () => {
    const { u, token } = await withToken();
    const res = await testApp.request(`/opds/${u.id}/library/ping`, { headers: basic(token, 'anything') }, env);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(`${u.id}:library:/opds/${u.id}/library`);
  });

  it('rejects a valid token owned by a disabled user', async () => {
    const { u, token } = await withToken();
    await env.DB.prepare('update users set disabled_at = 1 where id = ?').bind(u.id).run();
    const res = await testApp.request(`/opds/${u.id}/library/ping`, { headers: basic(token) }, env);
    expect(res.status).toBe(401);
    expect(res.headers.get('www-authenticate')).toBe('Basic realm="Spinecast"');
  });

  it('rejects wrong tokens, wrong scope and unknown users', async () => {
    const { u, token } = await withToken('public');
    expect((await testApp.request(`/opds/${u.id}/public/ping`, { headers: basic('wrongwrongwrongwrongwron') }, env)).status).toBe(401);
    expect((await testApp.request(`/opds/${u.id}/library/ping`, { headers: basic(token) }, env)).status).toBe(401);
    expect((await testApp.request(`/opds/nobody/public/ping`, { headers: basic(token) }, env)).status).toBe(401);
    expect((await testApp.request(`/opds/${u.id}/other/ping`, { headers: basic(token) }, env)).status).toBe(404);
  });

  it('resolves the short slug path to the same user and scope', async () => {
    const { u, token } = await withToken('public');
    const res = await testApp.request(`/o/${u.slug}/p/ping`, { headers: basic(token) }, env);
    expect(res.status).toBe(200);
    // The base stays on the short form so the feed's own links do too.
    expect(await res.text()).toBe(`${u.id}:public:/o/${u.slug}/p`);
  });

  it('answers an unknown slug like a wrong token, and an unknown scope letter with 404', async () => {
    const { u, token } = await withToken();
    expect((await testApp.request(`/o/zzzzzz/l/ping`, { headers: basic(token) }, env)).status).toBe(401);
    expect((await testApp.request(`/o/${u.slug}/p/ping`, { headers: basic(token) }, env)).status).toBe(401);
    expect((await testApp.request(`/o/${u.slug}/x/ping`, { headers: basic(token) }, env)).status).toBe(404);
  });

  it('touches last_used_at at most once per minute', async () => {
    const { u, token } = await withToken();
    await testApp.request(`/opds/${u.id}/library/ping`, { headers: basic(token) }, env);
    const first = (await findOpdsToken(env.DB, u.id, 'library'))!.last_used_at;
    expect(first).not.toBeNull();
    await env.DB.prepare('update opds_tokens set last_used_at = ? where user_id = ?').bind(first! - 10, u.id).run();
    await testApp.request(`/opds/${u.id}/library/ping`, { headers: basic(token) }, env);
    expect((await findOpdsToken(env.DB, u.id, 'library'))!.last_used_at).toBe(first! - 10);
    await env.DB.prepare('update opds_tokens set last_used_at = ? where user_id = ?').bind(first! - 120, u.id).run();
    await testApp.request(`/opds/${u.id}/library/ping`, { headers: basic(token) }, env);
    expect((await findOpdsToken(env.DB, u.id, 'library'))!.last_used_at).toBeGreaterThanOrEqual(first!);
  });

  it('returns 429 after too many failures from one ip', async () => {
    const { u, token } = await withToken();
    const ip = { 'cf-connecting-ip': '203.0.113.9' };
    for (let i = 0; i < OPDS_RATE_LIMIT; i++) {
      const r = await testApp.request(`/opds/${u.id}/library/ping`, { headers: { ...basic('badbadbadbadbadbadbadbad'), ...ip } }, env);
      expect(r.status).toBe(401);
    }
    const blocked = await testApp.request(`/opds/${u.id}/library/ping`, { headers: { ...basic(token), ...ip } }, env);
    expect(blocked.status).toBe(429);
    const otherIp = await testApp.request(`/opds/${u.id}/library/ping`, { headers: { ...basic(token), 'cf-connecting-ip': '203.0.113.10' } }, env);
    expect(otherIp.status).toBe(200);
  });
});
