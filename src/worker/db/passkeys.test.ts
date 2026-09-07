import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createUser } from '../../../test/helpers';
import { randomHex } from '../services/crypto';
import { deletePasskey, findPasskeyById, insertPasskey, listPasskeys, renamePasskey, toPasskeyDto, touchPasskey } from './passkeys';

const seed = (userId: string, id: string, name: string, createdAt: number, counter = 0) =>
  insertPasskey(env.DB, { id, user_id: userId, public_key: 'cHVi', counter, transports: 'internal', name, created_at: createdAt, last_used_at: null });

// The credential id is the primary key across every user and the whole file
// shares one database, so a hardcoded id would collide between tests.
const cid = () => `cred-${randomHex(6)}`;

describe('passkeys table', () => {
  it('lists a user passkeys oldest first', async () => {
    const user = await createUser(env);
    const older = cid();
    const newer = cid();
    await seed(user.id, newer, 'iPhone', 200);
    await seed(user.id, older, 'MacBook', 100);
    expect((await listPasskeys(env.DB, user.id)).map((r) => r.id)).toEqual([older, newer]);
  });

  it('finds a credential without knowing the user, which is how login works', async () => {
    const user = await createUser(env);
    const id = cid();
    await seed(user.id, id, 'MacBook', 100);
    expect((await findPasskeyById(env.DB, id))?.user_id).toBe(user.id);
    expect(await findPasskeyById(env.DB, cid())).toBeNull();
  });

  it('refuses a credential id that already exists, even for another user', async () => {
    const first = await createUser(env);
    const second = await createUser(env);
    const id = cid();
    expect(await seed(first.id, id, 'MacBook', 100)).toBe(true);
    expect(await seed(second.id, id, 'Stolen', 200)).toBe(false);
    expect((await findPasskeyById(env.DB, id))?.user_id).toBe(first.id);
  });

  it('renames and deletes only your own passkey', async () => {
    const mine = await createUser(env);
    const other = await createUser(env);
    const theirs = cid();
    await seed(other.id, theirs, 'Theirs', 100);
    expect(await renamePasskey(env.DB, mine.id, theirs, 'Stolen')).toBe(false);
    expect(await deletePasskey(env.DB, mine.id, theirs)).toBe(false);
    expect((await findPasskeyById(env.DB, theirs))?.name).toBe('Theirs');

    const own = cid();
    await seed(mine.id, own, 'MacBook', 100);
    expect(await renamePasskey(env.DB, mine.id, own, 'MacBook Pro')).toBe(true);
    expect((await findPasskeyById(env.DB, own))?.name).toBe('MacBook Pro');
    expect(await deletePasskey(env.DB, mine.id, own)).toBe(true);
    expect(await findPasskeyById(env.DB, own)).toBeNull();
  });

  it('records the counter and the last use', async () => {
    const user = await createUser(env);
    const id = cid();
    await seed(user.id, id, 'MacBook', 100, 4);
    await touchPasskey(env.DB, id, 5, 999);
    const row = (await findPasskeyById(env.DB, id))!;
    expect(row.counter).toBe(5);
    expect(row.last_used_at).toBe(999);
    expect(toPasskeyDto(row)).toEqual({ id, name: 'MacBook', createdAt: 100, lastUsedAt: 999 });
  });

  it('drops a user passkeys with the user', async () => {
    const user = await createUser(env);
    const id = cid();
    await seed(user.id, id, 'MacBook', 100);
    await env.DB.prepare('delete from users where id = ?').bind(user.id).run();
    expect(await findPasskeyById(env.DB, id)).toBeNull();
  });
});
