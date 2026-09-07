import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createSession, deleteSession, getSession } from './session';

describe('session', () => {
  it('round-trips a user and device', async () => {
    const token = await createSession(env, 'user-1', 'dev-1');
    expect(await getSession(env, token)).toEqual({ userId: 'user-1', deviceId: 'dev-1' });
    await deleteSession(env, token);
    expect(await getSession(env, token)).toBeNull();
  });

  it('returns null for an unknown token', async () => {
    expect(await getSession(env, 'nope')).toBeNull();
  });

  // Sessions minted before this change hold a bare user id and must keep working
  // for the remaining 30 days of their TTL.
  it('reads a legacy bare user id value', async () => {
    await env.SESSIONS.put('session:legacy', 'user-legacy');
    expect(await getSession(env, 'legacy')).toEqual({ userId: 'user-legacy', deviceId: null });
  });

  it('returns null for a corrupt JSON value', async () => {
    await env.SESSIONS.put('session:broken', '{"d":"dev-1"}');
    expect(await getSession(env, 'broken')).toBeNull();
  });
});
