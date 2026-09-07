import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { checkRateLimit } from './rateLimit';

describe('rateLimit', () => {
  it('allows up to the limit then blocks', async () => {
    const key = `t:${Date.now()}`;
    for (let i = 0; i < 3; i++) expect(await checkRateLimit(env.SESSIONS, key, 3, 900)).toBe(true);
    expect(await checkRateLimit(env.SESSIONS, key, 3, 900)).toBe(false);
  });
});
