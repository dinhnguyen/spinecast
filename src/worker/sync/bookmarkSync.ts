import type { Env } from '../env';
import type { BookRow } from '../db/books';
import type { BookmarkRow } from '../db/bookmarks';
import { clearBookmarkDirty, findBookmark, upsertBookmark } from '../db/bookmarks';
import type { DeltaKind } from './deltaSync';
import { pullDelta, pushDelta } from './deltaSync';
import type { PutBookmarkItem, RemoteBookmark } from './crosspointClient';

const toPutItem = (r: BookmarkRow): PutBookmarkItem =>
  r.deleted === 1
    ? { id: r.id, deleted: 1 }
    : { id: r.id, xpath: r.xpath, percentage: r.percentage, summary: r.summary, si: r.si, pc: r.pc, pp: r.pp };

const mergeRemote = async (db: D1Database, bookId: string, item: RemoteBookmark): Promise<boolean> => {
  const local = await findBookmark(db, bookId, item.id);
  // The server owns updated_at, so a local row that is somehow newer is left alone
  // rather than clobbered; the next push reconciles it.
  if (local && local.updated_at >= item.updated_at) return false;
  await upsertBookmark(db, {
    id: item.id,
    book_id: bookId,
    xpath: item.xpath ?? local?.xpath ?? '',
    percentage: item.percentage ?? local?.percentage ?? 0,
    summary: item.summary ?? local?.summary ?? null,
    si: item.si ?? local?.si ?? null,
    pc: item.pc ?? local?.pc ?? null,
    pp: item.pp ?? local?.pp ?? null,
    chapter: local?.chapter ?? null,
    deleted: item.deleted,
    updated_at: item.updated_at,
    dirty: 0,
  });
  return true;
};

const BOOKMARK_KIND: DeltaKind<BookmarkRow, RemoteBookmark, PutBookmarkItem> = {
  kind: 'bookmarks',
  toPutItem,
  put: (client, document, items) => client.putBookmarks(document, items),
  get: (client, document, since, limit) => client.getBookmarks(document, since, limit),
  clearDirty: clearBookmarkDirty,
  merge: mergeRemote,
};

export const pushBookmarks = (env: Env, userId: string, book: BookRow, rows: BookmarkRow[]): Promise<{ pushed: boolean; error: string | null }> =>
  pushDelta(env, userId, book, rows, BOOKMARK_KIND);

export const pullBookmarks = (env: Env, userId: string, book: BookRow): Promise<{ merged: number; error: string | null }> =>
  pullDelta(env, userId, book, BOOKMARK_KIND);
