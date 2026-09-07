import type { Env } from '../env';
import type { BookRow } from '../db/books';
import type { SyncKind } from '../db/syncCursors';
import { getCursor, setCursor } from '../db/syncCursors';
import { describeSyncError, documentFor, getActiveSync, recordOutcome } from './syncService';
import type { CrosspointClient } from './crosspointClient';

const BATCH = 50;
const PAGE = 100;
// The sync server is untrusted for this class of thing (see the body-truncation
// comment in crosspointClient.ts): one that keeps returning more:true with a
// strictly increasing `until` and at least one item per page would otherwise
// loop forever, at 2 * items sequential D1 statements per iteration. 100 pages
// at 100 items each is 10,000 rows for a single book, far beyond anything
// a legitimate library would produce, so that is the cap.
const MAX_PAGES = 100;

export interface RemoteBase {
  id: string;
  deleted: number;
  updated_at: number;
}

export interface DeltaKind<Row extends { id: string }, Remote extends RemoteBase, PutItem> {
  kind: SyncKind;
  toPutItem: (row: Row) => PutItem;
  put: (client: CrosspointClient, document: string, items: PutItem[]) => Promise<{ until: number; accepted: number }>;
  get: (client: CrosspointClient, document: string, since: number, limit: number) => Promise<{ until: number; more: boolean; items: Remote[] }>;
  clearDirty: (db: D1Database, bookId: string, ids: string[]) => Promise<void>;
  merge: (db: D1Database, bookId: string, item: Remote) => Promise<boolean>;
}

export const pushDelta = async <Row extends { id: string }, Remote extends RemoteBase, PutItem>(
  env: Env,
  userId: string,
  book: BookRow,
  rows: Row[],
  kind: DeltaKind<Row, Remote, PutItem>,
): Promise<{ pushed: boolean; error: string | null }> => {
  if (rows.length === 0) return { pushed: false, error: null };
  const active = await getActiveSync(env, userId);
  if (!active) return { pushed: false, error: null };
  const document = documentFor(book, active.row.hash_method);
  try {
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      await kind.put(active.client, document, chunk.map(kind.toPutItem));
      await kind.clearDirty(env.DB, book.id, chunk.map((r) => r.id));
    }
    await recordOutcome(env, userId, null);
    return { pushed: true, error: null };
  } catch (e) {
    await recordOutcome(env, userId, e);
    return { pushed: false, error: describeSyncError(e) };
  }
};

export const pullDelta = async <Row extends { id: string }, Remote extends RemoteBase, PutItem>(
  env: Env,
  userId: string,
  book: BookRow,
  kind: DeltaKind<Row, Remote, PutItem>,
): Promise<{ merged: number; error: string | null }> => {
  const active = await getActiveSync(env, userId);
  if (!active) return { merged: 0, error: null };
  const document = documentFor(book, active.row.hash_method);
  let since = await getCursor(env.DB, userId, book.id, kind.kind);
  let merged = 0;
  try {
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await kind.get(active.client, document, since, PAGE);
      for (const item of res.items) if (await kind.merge(env.DB, book.id, item)) merged += 1;
      // Two different ways a hostile or buggy server could spin this loop forever:
      // an empty page still claiming more, or a page whose until never moves past since.
      const advanced = res.until > since;
      if (advanced) {
        since = res.until;
        await setCursor(env.DB, userId, book.id, kind.kind, since);
      }
      if (!res.more || res.items.length === 0 || !advanced) break;
    }
    await recordOutcome(env, userId, null);
    return { merged, error: null };
  } catch (e) {
    await recordOutcome(env, userId, e);
    return { merged, error: describeSyncError(e) };
  }
};
