import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { putChallenge, takeChallenge } from './challenge';

describe('challenge store', () => {
  it('returns the challenge once and never again', async () => {
    const id = await putChallenge(env.SESSIONS, 'chal-abc');
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(await takeChallenge(env.SESSIONS, id)).toBe('chal-abc');
    expect(await takeChallenge(env.SESSIONS, id)).toBeNull();
  });

  it('returns null for an id it never issued', async () => {
    expect(await takeChallenge(env.SESSIONS, 'made-up')).toBeNull();
  });

  it('keeps two challenges apart', async () => {
    const a = await putChallenge(env.SESSIONS, 'chal-a');
    const b = await putChallenge(env.SESSIONS, 'chal-b');
    expect(a).not.toBe(b);
    expect(await takeChallenge(env.SESSIONS, b)).toBe('chal-b');
    expect(await takeChallenge(env.SESSIONS, a)).toBe('chal-a');
  });
});
