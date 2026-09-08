import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createUser } from '../../../test/helpers';
import { deleteOpdsToken, findOpdsToken, isOpdsScope, touchOpdsToken, upsertOpdsToken } from './opdsTokens';

describe('opds tokens repository', () => {
  it('upserts, finds, touches and deletes per scope', async () => {
    const u = await createUser(env);
    expect(await findOpdsToken(env.DB, u.id, 'library')).toBeNull();
    await upsertOpdsToken(env.DB, u.id, 'library', 'h1', 'e1', 100);
    await upsertOpdsToken(env.DB, u.id, 'public', 'h2', 'e2', 101);
    expect((await findOpdsToken(env.DB, u.id, 'library'))!.token_hash).toBe('h1');
    expect((await findOpdsToken(env.DB, u.id, 'library'))!.token_enc).toBe('e1');
    expect((await findOpdsToken(env.DB, u.id, 'public'))!.token_hash).toBe('h2');

    await upsertOpdsToken(env.DB, u.id, 'library', 'h3', 'e3', 200);
    const replaced = await findOpdsToken(env.DB, u.id, 'library');
    expect(replaced!.token_hash).toBe('h3');
    expect(replaced!.token_enc).toBe('e3');
    expect(replaced!.created_at).toBe(200);
    expect(replaced!.last_used_at).toBeNull();

    await touchOpdsToken(env.DB, u.id, 'library', 300);
    expect((await findOpdsToken(env.DB, u.id, 'library'))!.last_used_at).toBe(300);

    await deleteOpdsToken(env.DB, u.id, 'library');
    expect(await findOpdsToken(env.DB, u.id, 'library')).toBeNull();
    expect(await findOpdsToken(env.DB, u.id, 'public')).not.toBeNull();
  });

  it('validates scope strings', () => {
    expect(isOpdsScope('library')).toBe(true);
    expect(isOpdsScope('public')).toBe(true);
    expect(isOpdsScope('Library')).toBe(false);
    expect(isOpdsScope('')).toBe(false);
  });
});
