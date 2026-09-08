import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { type BlobRow, findBlobByHash, insertBlobIfMissing } from '../db/bookBlobs';
import { insertBook } from '../db/books';
import { createUser } from '../../../test/helpers';
import { randomHex } from './crypto';
import { cleanupAdminStorage, getAdminOverview } from './adminStorage';

const id = (prefix: string): string => `${prefix}-${randomHex(8)}`;

const makeBook = (userId: string, overrides: { r2_key: string; blob_hash: string | null }) => ({
  id: id('book'),
  user_id: userId,
  title: 'T',
  author: 'A',
  filename: 'f.epub',
  filesize: 1,
  r2_key: overrides.r2_key,
  cover_r2_key: null,
  shared: 0,
  hash_partial: id('partial'),
  hash_filename: id('filename'),
  blob_hash: overrides.blob_hash,
  created_at: 1,
  last_opened_at: null,
  source_catalog_id: null,
  source_entry_id: null,
});

// A minimal in-memory fake covering only the SQL shapes adminStorage.ts issues, so the
// concurrency-race and repeat-run scenarios below are deterministic and independent of
// whatever else the shared worker-test D1 database holds.
interface FakeDbState {
  orphanRows: BlobRow[];
  registeredKeys: Set<string>;
}

const makeFakeDb = (state: FakeDbState): D1Database =>
  ({
    prepare: (sql: string) => ({
      bind: (...args: unknown[]) => ({
        first: async () => {
          if (sql.includes('select 1 as present')) {
            return state.registeredKeys.has(args[0] as string) ? { present: 1 } : null;
          }
          return null;
        },
        run: async () => {
          if (sql.includes('delete from book_blobs')) {
            const hash = args[0] as string;
            const idx = state.orphanRows.findIndex((r) => r.content_hash === hash);
            if (idx < 0) return { meta: { changes: 0 } };
            state.orphanRows.splice(idx, 1);
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        },
      }),
      all: async () => {
        if (sql.includes('select bb.* from book_blobs')) return { results: state.orphanRows };
        return { results: [] };
      },
      first: async () => null,
    }),
  }) as unknown as D1Database;

const makeFakeBucket = (objects: R2Object[]): R2Bucket => {
  const store = new Map(objects.map((o) => [o.key, o]));
  return {
    list: async () => ({ objects: [...store.values()], truncated: false }),
    head: async (key: string) => (store.has(key) ? ({} as R2Object) : null),
    delete: async (key: string) => {
      store.delete(key);
    },
  } as unknown as R2Bucket;
};

describe('adminStorage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('computes overview deltas and cleans up orphan rows/objects without touching referenced or legacy objects', async () => {
    const baseline = await getAdminOverview(env.DB, env.BOOKS);

    const user = await createUser(env);
    const referencedHash = randomHex(16);
    const orphanHash = randomHex(16);
    const referencedKey = `blobs/${referencedHash}.epub`;
    const rowOrphanKey = `blobs/${orphanHash}.epub`;
    const objectOrphanKey = `blobs/${randomHex(16)}.epub`;
    const legacyKey = `users/${user.id}/books/${randomHex(16)}.epub`;

    await env.BOOKS.put(referencedKey, new Uint8Array([1]));
    await env.BOOKS.put(rowOrphanKey, new Uint8Array([2, 2]));
    await env.BOOKS.put(objectOrphanKey, new Uint8Array([3, 3, 3]));
    await env.BOOKS.put(legacyKey, new Uint8Array([4, 4, 4, 4]));

    await insertBlobIfMissing(env.DB, { content_hash: referencedHash, r2_key: referencedKey, filesize: 1, created_at: 1 });
    await insertBlobIfMissing(env.DB, { content_hash: orphanHash, r2_key: rowOrphanKey, filesize: 2, created_at: 1 });

    await insertBook(env.DB, makeBook(user.id, { r2_key: referencedKey, blob_hash: referencedHash }));
    await insertBook(env.DB, makeBook(user.id, { r2_key: legacyKey, blob_hash: null }));

    const afterSeed = await getAdminOverview(env.DB, env.BOOKS);
    expect(afterSeed.users - baseline.users).toBe(1);
    expect(afterSeed.books - baseline.books).toBe(2);
    expect(afterSeed.blobs - baseline.blobs).toBe(2);
    expect(afterSeed.blobBytes - baseline.blobBytes).toBe(3);
    expect(afterSeed.orphanBlobRows - baseline.orphanBlobRows).toBe(1);
    expect(afterSeed.orphanObjects - baseline.orphanObjects).toBe(1);

    await cleanupAdminStorage(env.DB, env.BOOKS);

    expect(await env.BOOKS.head(referencedKey)).not.toBeNull();
    expect(await env.BOOKS.head(legacyKey)).not.toBeNull();
    expect(await env.BOOKS.head(rowOrphanKey)).toBeNull();
    expect(await env.BOOKS.head(objectOrphanKey)).toBeNull();
    expect(await findBlobByHash(env.DB, orphanHash)).toBeNull();
  });

  it('paginates the R2 listing across multiple pages and both pages contribute to orphanObjects', async () => {
    const first = { key: `blobs/${randomHex(16)}.epub` } as R2Object;
    const second = { key: `blobs/${randomHex(16)}.epub` } as R2Object;
    const list = vi
      .fn()
      .mockResolvedValueOnce({ objects: [first], truncated: true, cursor: 'next' })
      .mockResolvedValueOnce({ objects: [second], truncated: false });
    const fakeBucket = { list, head: vi.fn(), delete: vi.fn() } as unknown as R2Bucket;

    const overview = await getAdminOverview(env.DB, fakeBucket);

    expect(list).toHaveBeenCalledTimes(2);
    expect(list.mock.calls[0]?.[0]).toEqual({ prefix: 'blobs/' });
    expect(list.mock.calls[1]?.[0]).toEqual({ prefix: 'blobs/', cursor: 'next' });
    expect(overview.orphanObjects).toBe(2);
  });

  it('skips an object-only candidate that becomes registered before the delete-time recheck', async () => {
    const key = `blobs/${randomHex(16)}.epub`;
    const bucket = makeFakeBucket([{ key } as R2Object]);
    // Simulates a concurrent upload registering this key between the list phase (which
    // picked it up as a candidate) and the recheck immediately before deletion.
    const db = makeFakeDb({ orphanRows: [], registeredKeys: new Set([key]) });

    const result = await cleanupAdminStorage(db, bucket);

    expect(result).toEqual({ deletedRows: 0, deletedObjects: 0 });
    expect(await bucket.head(key)).not.toBeNull();
  });

  it('is a no-op on a second run against a controlled fake', async () => {
    const orphanKey = `blobs/${randomHex(16)}.epub`;
    const orphanHash = randomHex(16);
    const bucket = makeFakeBucket([{ key: orphanKey } as R2Object]);
    const db = makeFakeDb({
      orphanRows: [{ content_hash: orphanHash, r2_key: orphanKey, filesize: 1, created_at: 1 }],
      registeredKeys: new Set(),
    });

    const first = await cleanupAdminStorage(db, bucket);
    expect(first).toEqual({ deletedRows: 1, deletedObjects: 1 });

    const second = await cleanupAdminStorage(db, bucket);
    expect(second).toEqual({ deletedRows: 0, deletedObjects: 0 });
  });
});
