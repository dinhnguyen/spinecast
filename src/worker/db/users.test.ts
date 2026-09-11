import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createUser } from '../../../test/helpers';
import { ensureUserSlug, findUserBySlug } from './users';

// A D1 stand-in whose update always throws, to separate a slug collision - which
// deserves another draw - from an error that must not be retried away.
const throwingDb = (message: string): D1Database =>
  ({
    prepare: () => ({
      bind: () => ({
        run: () => Promise.reject(new Error(message)),
      }),
    }),
  }) as unknown as D1Database;

describe('ensureUserSlug', () => {
  it('assigns once and is stable across calls', async () => {
    const u = await createUser(env);
    expect(u.slug).toMatch(/^[a-z2-7]{6}$/);
    expect(await ensureUserSlug(env.DB, { id: u.id, slug: null })).toBe(u.slug);
    expect((await findUserBySlug(env.DB, u.slug))!.id).toBe(u.id);
  });

  it('surfaces an error that is not a collision instead of retrying it away', async () => {
    // What an unapplied 0014 looks like from here.
    await expect(ensureUserSlug(throwingDb('D1_ERROR: no such column: slug'), { id: 'u1', slug: null })).rejects.toThrow(
      'no such column: slug',
    );
  });
});
