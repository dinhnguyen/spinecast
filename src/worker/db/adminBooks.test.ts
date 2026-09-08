import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createUser } from '../../../test/helpers';
import { randomHex } from '../services/crypto';
import { listAdminBooks } from './adminBooks';
import { insertBlobIfMissing } from './bookBlobs';
import { insertBook, setBookShared } from './books';

const id = (prefix: string): string => `${prefix}-${randomHex(8)}`;
const book = (userId: string, filesize: number, blobHash: string | null, shared = 0) => ({
  id: id('book'),
  user_id: userId,
  title: `Secret title ${randomHex(2)}`,
  author: 'Secret author',
  filename: `${randomHex(3)}.epub`,
  filesize,
  r2_key: id('r2'),
  cover_r2_key: null,
  shared,
  hash_partial: id('hp'),
  hash_filename: id('hf'),
  blob_hash: blobHash,
  created_at: 1,
  last_opened_at: null,
  source_catalog_id: null,
  source_entry_id: null,
});

describe('listAdminBooks', () => {
  it('omits title and author and counts blob refs', async () => {
    const firstUser = await createUser(env, { email: `a-${randomHex(4)}@t.local` });
    const secondUser = await createUser(env, { email: `b-${randomHex(4)}@t.local` });
    const hash = randomHex(16);
    await insertBlobIfMissing(env.DB, { content_hash: hash, r2_key: `blobs/${hash}.epub`, filesize: 500, created_at: 1 });
    const sharedFirst = book(firstUser.id, 500, hash, 1);
    const sharedSecond = book(secondUser.id, 500, hash);
    const legacy = book(firstUser.id, 9_000_000, null);
    await insertBook(env.DB, sharedFirst);
    await setBookShared(env.DB, firstUser.id, sharedFirst.id, true);
    await insertBook(env.DB, sharedSecond);
    await insertBook(env.DB, legacy);

    const page = await listAdminBooks(env.DB, 'size', null);
    const mine = page.items.filter((item) => [sharedFirst.id, sharedSecond.id, legacy.id].includes(item.id));
    expect(mine).toHaveLength(3);
    for (const item of mine) {
      expect(Object.keys(item).sort()).toEqual(
        ['blobHash', 'blobRefs', 'createdAt', 'filename', 'filesize', 'id', 'ownerEmail', 'ownerId', 'shared'].sort(),
      );
    }
    expect(mine.find((item) => item.id === sharedFirst.id)).toMatchObject({ blobRefs: 2, shared: true, ownerEmail: firstUser.email });
    expect(mine.find((item) => item.id === legacy.id)).toMatchObject({ blobRefs: 1, blobHash: null });
  });

  it('pages every row exactly once under each sort', async () => {
    const user = await createUser(env, { email: `p-${randomHex(4)}@t.local` });
    const ids = new Set<string>();
    for (let index = 0; index < 55; index++) {
      const row = book(user.id, 1000 + index, null);
      ids.add(row.id);
      await insertBook(env.DB, row);
    }
    for (const sort of ['size', 'owner', 'shared'] as const) {
      const seen = new Set<string>();
      let cursor: string | null = null;
      do {
        const page = await listAdminBooks(env.DB, sort, cursor);
        expect(page.items.length).toBeLessThanOrEqual(50);
        for (const item of page.items) {
          expect(seen.has(item.id)).toBe(false);
          seen.add(item.id);
        }
        cursor = page.nextCursor;
      } while (cursor);
      for (const wanted of ids) expect(seen.has(wanted)).toBe(true);
    }
  });

  it('rejects a cursor minted for a different sort', async () => {
    const user = await createUser(env, { email: `c-${randomHex(4)}@t.local` });
    for (let index = 0; index < 51; index++) await insertBook(env.DB, book(user.id, 2000 + index, null));
    const page = await listAdminBooks(env.DB, 'size', null);
    expect(page.nextCursor).not.toBeNull();
    await expect(listAdminBooks(env.DB, 'owner', page.nextCursor)).rejects.toMatchObject({ status: 400, code: 'validation' });
  });
});
