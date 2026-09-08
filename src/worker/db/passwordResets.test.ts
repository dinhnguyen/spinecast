import { env } from 'cloudflare:workers';
import { describe, expect, it, vi } from 'vitest';
import { createUser } from '../../../test/helpers';
import { consumePasswordReset, findPasswordReset, issuePasswordReset } from './passwordResets';
import { findUserById } from './users';
import { hashPassword, sha256Hex } from '../services/crypto';
import * as crypto from '../services/crypto';

const now = 1800000000;
const setup = async () => {
  const admin = await createUser(env, { role: 'admin' });
  const user = await createUser(env);
  const issued = await issuePasswordReset(env.DB, user.id, admin.id, now);
  return { admin, user, issued, codeHash: await sha256Hex(issued.code) };
};

describe('password resets on real D1', () => {
  it('stores only a hash with a one-day expiry and replaces unused codes', async () => {
    const { admin, user, issued, codeHash } = await setup();
    expect(issued.expiresAt).toBe(now + 86400);
    expect(await findPasswordReset(env.DB, codeHash)).toEqual({ code_hash: codeHash, user_id: user.id, created_by: admin.id, expires_at: now + 86400, created_at: now, used_at: null });
    expect(await findPasswordReset(env.DB, issued.code)).toBeNull();
    const replacement = await issuePasswordReset(env.DB, user.id, admin.id, now + 1);
    expect(await findPasswordReset(env.DB, codeHash)).toBeNull();
    expect(await findPasswordReset(env.DB, await sha256Hex(replacement.code))).not.toBeNull();
  });

  it('allows exactly one simultaneous consume and returns that update epoch', async () => {
    const { user, codeHash } = await setup();
    await env.DB.prepare('update users set session_epoch = 5 where id = ?').bind(user.id).run();
    const hashes = await Promise.all(['first-password-123', 'second-password-123'].map(hashPassword));
    const results = await Promise.all(hashes.map((hash) => consumePasswordReset(env.DB, codeHash, hash, now + 1)));
    expect(results.filter(Boolean)).toHaveLength(1);
    const winnerIndex = results.findIndex(Boolean);
    expect(results[winnerIndex]).toMatchObject({ id: user.id, password_hash: hashes[winnerIndex], session_epoch: 6 });
    expect(await findUserById(env.DB, user.id)).toMatchObject({ password_hash: hashes[winnerIndex], session_epoch: 6 });
    expect((await findPasswordReset(env.DB, codeHash))!.used_at).toBe(now + 1);
    expect(await consumePasswordReset(env.DB, codeHash, 'replay-hash', now + 2)).toBeNull();
    expect(await findUserById(env.DB, user.id)).toMatchObject({ password_hash: hashes[winnerIndex], session_epoch: 6 });
  });

  it('retains one unused code after simultaneous issuance without assuming winner order', async () => {
    const { admin, user } = await setup();
    const issued = await Promise.all([issuePasswordReset(env.DB, user.id, admin.id, now + 1), issuePasswordReset(env.DB, user.id, admin.id, now + 1)]);
    const hashes = await Promise.all(issued.map((result) => sha256Hex(result.code)));
    const rows = await env.DB.prepare('select code_hash from password_resets where user_id = ? and used_at is null').bind(user.id).all<{ code_hash: string }>();
    expect(rows.results).toHaveLength(1);
    expect(hashes).toContain(rows.results[0]!.code_hash);
  });

  it.each([0, -1])('does not mutate an expired code at offset %i', async (offset) => {
    const { user, codeHash } = await setup();
    await env.DB.prepare('update password_resets set expires_at = ? where code_hash = ?').bind(now + offset, codeHash).run();
    const before = await findUserById(env.DB, user.id);
    expect(await consumePasswordReset(env.DB, codeHash, 'replacement', now)).toBeNull();
    expect(await findUserById(env.DB, user.id)).toEqual(before);
    expect((await findPasswordReset(env.DB, codeHash))!.used_at).toBeNull();
  });

  it('does not mark a disabled owner code used even after a previous write changed one row', async () => {
    const { user, codeHash } = await setup();
    await env.DB.prepare('update users set disabled_at = 1 where id = ?').bind(user.id).run();
    const before = await findUserById(env.DB, user.id);
    expect(await consumePasswordReset(env.DB, codeHash, 'replacement', now)).toBeNull();
    expect(await findUserById(env.DB, user.id)).toEqual(before);
    expect((await findPasswordReset(env.DB, codeHash))!.used_at).toBeNull();
  });

  it('rejects unknown codes without changing the user', async () => {
    const { user } = await setup();
    const before = await findUserById(env.DB, user.id);
    expect(await findPasswordReset(env.DB, 'unknown')).toBeNull();
    expect(await consumePasswordReset(env.DB, 'unknown', 'replacement', now)).toBeNull();
    expect(await findUserById(env.DB, user.id)).toEqual(before);
  });

  it('rolls back issuance deletion on collision and preserves used-code history', async () => {
    const { admin, user, issued, codeHash } = await setup();
    expect(await consumePasswordReset(env.DB, codeHash, 'new-hash', now + 1)).not.toBeNull();
    const live = await issuePasswordReset(env.DB, user.id, admin.id, now + 2);
    const liveHash = await sha256Hex(live.code);
    const generator = vi.spyOn(crypto, 'randomHex').mockReturnValue(issued.code);
    try { await expect(issuePasswordReset(env.DB, user.id, admin.id, now + 3)).rejects.toThrow(); }
    finally { generator.mockRestore(); }
    expect((await findPasswordReset(env.DB, codeHash))!.used_at).toBe(now + 1);
    expect((await findPasswordReset(env.DB, liveHash))!.used_at).toBeNull();
  });
});
