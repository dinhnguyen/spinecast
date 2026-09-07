import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createUser } from '../../../test/helpers';
import { deleteDevice, findDevice, insertDevice, listDevices, renameDevice, touchDevice } from './devices';

const seed = async (userId: string, id: string, name: string, lastSeen: number): Promise<void> =>
  insertDevice(env.DB, { id, user_id: userId, name, created_at: lastSeen, last_seen_at: lastSeen });

describe('devices table', () => {
  it('lists a user devices newest seen first', async () => {
    const user = await createUser(env);
    await seed(user.id, 'dev-a', 'Chrome · macOS', 100);
    await seed(user.id, 'dev-b', 'Safari · iOS', 200);
    const rows = await listDevices(env.DB, user.id);
    expect(rows.map((r) => r.id)).toEqual(['dev-b', 'dev-a']);
  });

  it('does not leak devices across users', async () => {
    const mine = await createUser(env);
    const other = await createUser(env);
    await seed(other.id, 'dev-other', 'Chrome · Windows', 100);
    expect(await listDevices(env.DB, mine.id)).toEqual([]);
    expect(await findDevice(env.DB, mine.id, 'dev-other')).toBeNull();
    expect(await renameDevice(env.DB, mine.id, 'dev-other', 'Stolen')).toBe(false);
    expect(await deleteDevice(env.DB, mine.id, 'dev-other')).toBe(false);
    await touchDevice(env.DB, mine.id, 'dev-other', 999);
    expect((await findDevice(env.DB, other.id, 'dev-other'))?.last_seen_at).toBe(100);
  });

  it('renames and deletes an own device', async () => {
    const user = await createUser(env);
    await seed(user.id, 'dev-c', 'Chrome · macOS', 100);
    expect(await renameDevice(env.DB, user.id, 'dev-c', 'Laptop')).toBe(true);
    expect((await findDevice(env.DB, user.id, 'dev-c'))?.name).toBe('Laptop');
    expect(await deleteDevice(env.DB, user.id, 'dev-c')).toBe(true);
    expect(await findDevice(env.DB, user.id, 'dev-c')).toBeNull();
  });

  it('touches last seen without touching created at', async () => {
    const user = await createUser(env);
    await seed(user.id, 'dev-d', 'Chrome · macOS', 100);
    await touchDevice(env.DB, user.id, 'dev-d', 500);
    const row = await findDevice(env.DB, user.id, 'dev-d');
    expect(row?.last_seen_at).toBe(500);
    expect(row?.created_at).toBe(100);
  });
});
