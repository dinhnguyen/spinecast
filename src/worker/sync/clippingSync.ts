import type { Env } from '../env';
import type { BookRow } from '../db/books';
import type { ClippingRow } from '../db/clippings';
import { clearClippingDirty, findClipping, upsertClipping } from '../db/clippings';
import type { DeltaKind } from './deltaSync';
import { pullDelta, pushDelta } from './deltaSync';
import type { PutClippingItem, RemoteClipping } from './crosspointClient';

const toPutItem = (r: ClippingRow): PutClippingItem =>
  r.deleted === 1
    ? { id: r.id, deleted: 1 }
    : {
        id: r.id,
        spine: r.spine,
        start_page: r.start_page,
        end_page: r.end_page,
        pages: r.pages,
        start_word: r.start_word,
        end_word: r.end_word,
        words: r.words,
        para: r.para,
        chapter: r.chapter,
        text: r.text,
        note: r.note,
        color: r.color,
        created_at: r.created_at,
      };

const mergeRemote = async (db: D1Database, bookId: string, item: RemoteClipping): Promise<boolean> => {
  const local = await findClipping(db, bookId, item.id);
  // The server owns updated_at, so a local row that is somehow newer is left alone
  // rather than clobbered; the next push reconciles it.
  if (local && local.updated_at >= item.updated_at) return false;
  await upsertClipping(db, {
    id: item.id,
    book_id: bookId,
    spine: item.spine ?? local?.spine ?? null,
    start_page: item.start_page ?? local?.start_page ?? null,
    end_page: item.end_page ?? local?.end_page ?? null,
    pages: item.pages ?? local?.pages ?? null,
    start_word: item.start_word ?? local?.start_word ?? null,
    end_word: item.end_word ?? local?.end_word ?? null,
    words: item.words ?? local?.words ?? null,
    para: item.para ?? local?.para ?? null,
    chapter: item.chapter ?? local?.chapter ?? null,
    text: item.text ?? local?.text ?? '',
    note: item.note ?? local?.note ?? null,
    color: item.color ?? local?.color ?? null,
    cfi: null,
    created_at: item.created_at ?? local?.created_at ?? 0,
    deleted: item.deleted,
    updated_at: item.updated_at,
    dirty: 0,
  });
  return true;
};

const CLIPPING_KIND: DeltaKind<ClippingRow, RemoteClipping, PutClippingItem> = {
  kind: 'clippings',
  toPutItem,
  put: (client, document, items) => client.putClippings(document, items),
  get: (client, document, since, limit) => client.getClippings(document, since, limit),
  clearDirty: clearClippingDirty,
  merge: mergeRemote,
};

export const pushClippings = (env: Env, userId: string, book: BookRow, rows: ClippingRow[]): Promise<{ pushed: boolean; error: string | null }> =>
  pushDelta(env, userId, book, rows, CLIPPING_KIND);

export const pullClippings = (env: Env, userId: string, book: BookRow): Promise<{ merged: number; error: string | null }> =>
  pullDelta(env, userId, book, CLIPPING_KIND);
