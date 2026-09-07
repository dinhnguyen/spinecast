import { env } from 'cloudflare:workers';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { app } from '../app';
import { md5Hex } from '../services/crypto';
import { setSyncFetchForTests } from '../sync/syncService';
import { createUserAndLogin, jsonRequest, uploadFixture } from '../../../test/helpers';
import { createMockCrosspoint } from '../../../test/mockCrosspoint';
import { findClipping, upsertClipping } from '../db/clippings';
import { findBook } from '../db/books';
import type { ClippingDto, ClippingsDto, ClippingSyncResponse } from '../../shared/apiTypes';
import { HIGHLIGHT_COLORS } from '../services/clippingId';

const NEW = { text: 'It was the best of times', spine: 3, para: 12, chapter: 'Chapter 3', color: '#f4e3a1', note: 'first look' };

const list = async (bookId: string, cookie: string): Promise<ClippingsDto> => {
  const res = await app.request(`/api/books/${bookId}/clippings`, { headers: { cookie } }, env);
  expect(res.status).toBe(200);
  return res.json();
};

describe('clippings api', () => {
  let mock: ReturnType<typeof createMockCrosspoint>;
  beforeEach(() => {
    mock = createMockCrosspoint();
    setSyncFetchForTests(mock.fetch);
  });
  afterEach(() => setSyncFetchForTests(null));

  it('creates a clipping and lists it', async () => {
    const { cookie } = await createUserAndLogin(env);
    const book = await uploadFixture(env, cookie);
    const res = await app.request(...jsonRequest(`/api/books/${book.id}/clippings`, 'POST', NEW, cookie), env);
    expect(res.status).toBe(201);
    const dto = (await res.json()) as ClippingDto;
    expect(dto.id).toMatch(/^[0-9a-f]{16}$/);
    expect(dto.text).toBe(NEW.text);
    expect(dto.chapter).toBe(NEW.chapter);
    expect((await list(book.id, cookie)).clippings.map((cl) => cl.id)).toEqual([dto.id]);
  });

  it('is idempotent for the same text created in the same second', async () => {
    const { cookie } = await createUserAndLogin(env);
    const book = await uploadFixture(env, cookie);
    const res1 = await app.request(...jsonRequest(`/api/books/${book.id}/clippings`, 'POST', NEW, cookie), env);
    const res2 = await app.request(...jsonRequest(`/api/books/${book.id}/clippings`, 'POST', { ...NEW, note: 'second' }, cookie), env);
    const dto1 = (await res1.json()) as ClippingDto;
    const dto2 = (await res2.json()) as ClippingDto;
    // The id derives from created_at (server clock, seconds) and text: assert the
    // actual idempotency condition directly rather than inferring it from a list
    // count, which would fail for the unrelated reason of a crossed second boundary.
    expect(dto2.createdAt).toBe(dto1.createdAt);
    expect(dto2.id).toBe(dto1.id);
    const all = (await list(book.id, cookie)).clippings;
    expect(all).toHaveLength(1);
    expect(all[0]!.note).toBe('second');
  });

  it('succeeds and leaves the row dirty when sync is unconfigured', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    const dto = await uploadFixture(env, cookie);
    const res = await app.request(...jsonRequest(`/api/books/${dto.id}/clippings`, 'POST', NEW, cookie), env);
    expect(res.status).toBe(201);
    const created = (await res.json()) as ClippingDto;
    const book = (await findBook(env.DB, user.id, dto.id))!;
    expect((await findClipping(env.DB, book.id, created.id))?.dirty).toBe(1);
  });

  it('patches the note without changing the id, and moves updated_at', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    const dto = await uploadFixture(env, cookie);
    const book = (await findBook(env.DB, user.id, dto.id))!;
    const created = (await (await app.request(...jsonRequest(`/api/books/${dto.id}/clippings`, 'POST', NEW, cookie), env)).json()) as ClippingDto;
    // Backdate updated_at directly so the assertion below does not depend on real
    // wall-clock time passing between the create and the patch.
    const before = (await findClipping(env.DB, book.id, created.id))!;
    await upsertClipping(env.DB, { ...before, updated_at: 1 });
    const res = await app.request(...jsonRequest(`/api/books/${dto.id}/clippings/${created.id}`, 'PATCH', { note: 'revised note' }, cookie), env);
    expect(res.status).toBe(200);
    const patched = (await res.json()) as ClippingDto;
    expect(patched.id).toBe(created.id);
    expect(patched.note).toBe('revised note');
    const after = (await findClipping(env.DB, book.id, created.id))!;
    expect(after.updated_at).toBeGreaterThan(1);
  });

  it('sets cfi via patch without touching dirty or updated_at', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    const dto = await uploadFixture(env, cookie);
    const book = (await findBook(env.DB, user.id, dto.id))!;
    const created = (await (await app.request(...jsonRequest(`/api/books/${dto.id}/clippings`, 'POST', NEW, cookie), env)).json()) as ClippingDto;
    // Simulate a row that has already been synced, so the assertions below isolate
    // what the cfi-only patch itself does rather than what create/sync did.
    const stored = (await findClipping(env.DB, book.id, created.id))!;
    await upsertClipping(env.DB, { ...stored, dirty: 0 });
    const before = (await findClipping(env.DB, book.id, created.id))!;
    expect(before.dirty).toBe(0);
    const res = await app.request(...jsonRequest(`/api/books/${dto.id}/clippings/${created.id}`, 'PATCH', { cfi: 'epubcfi(/6/4!/4/2/2)' }, cookie), env);
    expect(res.status).toBe(200);
    const after = (await findClipping(env.DB, book.id, created.id))!;
    expect(after.cfi).toBe('epubcfi(/6/4!/4/2/2)');
    expect(after.dirty).toBe(0);
    expect(after.updated_at).toBe(before.updated_at);
  });

  it('marks dirty and bumps updated_at when cfi is patched together with note or colour', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    const dto = await uploadFixture(env, cookie);
    const book = (await findBook(env.DB, user.id, dto.id))!;
    const created = (await (await app.request(...jsonRequest(`/api/books/${dto.id}/clippings`, 'POST', NEW, cookie), env)).json()) as ClippingDto;
    const stored = (await findClipping(env.DB, book.id, created.id))!;
    await upsertClipping(env.DB, { ...stored, dirty: 0, updated_at: 1 });
    const res = await app.request(...jsonRequest(`/api/books/${dto.id}/clippings/${created.id}`, 'PATCH', { cfi: 'epubcfi(/6/4!/4/2/2)', note: 'combined edit' }, cookie), env);
    expect(res.status).toBe(200);
    const after = (await findClipping(env.DB, book.id, created.id))!;
    expect(after.cfi).toBe('epubcfi(/6/4!/4/2/2)');
    expect(after.note).toBe('combined edit');
    expect(after.dirty).toBe(1);
    expect(after.updated_at).toBeGreaterThan(1);
  });

  it('rejects an unknown colour and accepts each of the four valid ones', async () => {
    const { cookie } = await createUserAndLogin(env);
    const book = await uploadFixture(env, cookie);
    const created = (await (await app.request(...jsonRequest(`/api/books/${book.id}/clippings`, 'POST', NEW, cookie), env)).json()) as ClippingDto;
    const bad = await app.request(...jsonRequest(`/api/books/${book.id}/clippings/${created.id}`, 'PATCH', { color: '#000000' }, cookie), env);
    expect(bad.status).toBe(400);
    for (const color of HIGHLIGHT_COLORS) {
      const res = await app.request(...jsonRequest(`/api/books/${book.id}/clippings/${created.id}`, 'PATCH', { color }, cookie), env);
      expect(res.status).toBe(200);
      expect(((await res.json()) as ClippingDto).color).toBe(color);
    }
  });

  it('404s patching an unknown clipping and on another user book', async () => {
    const other = await createUserAndLogin(env);
    const otherBook = await uploadFixture(env, other.cookie);
    const otherCreated = (await (await app.request(...jsonRequest(`/api/books/${otherBook.id}/clippings`, 'POST', NEW, other.cookie), env)).json()) as ClippingDto;
    const { cookie } = await createUserAndLogin(env);
    const book = await uploadFixture(env, cookie);
    const missing = await app.request(...jsonRequest(`/api/books/${book.id}/clippings/0123456789abcdef`, 'PATCH', { note: 'x' }, cookie), env);
    expect(missing.status).toBe(404);
    const foreign = await app.request(...jsonRequest(`/api/books/${otherBook.id}/clippings/${otherCreated.id}`, 'PATCH', { note: 'x' }, cookie), env);
    expect(foreign.status).toBe(404);
  });

  it('deletes a clipping and stops listing it', async () => {
    const { cookie } = await createUserAndLogin(env);
    const book = await uploadFixture(env, cookie);
    const created = (await (await app.request(...jsonRequest(`/api/books/${book.id}/clippings`, 'POST', NEW, cookie), env)).json()) as ClippingDto;
    const del = await app.request(`/api/books/${book.id}/clippings/${created.id}`, { method: 'DELETE', headers: { cookie } }, env);
    expect(del.status).toBe(204);
    expect((await list(book.id, cookie)).clippings).toEqual([]);
  });

  it('404s on an unknown clipping delete and on another user book listing', async () => {
    const other = await createUserAndLogin(env);
    const otherBook = await uploadFixture(env, other.cookie);
    const { cookie } = await createUserAndLogin(env);
    const book = await uploadFixture(env, cookie);
    const missing = await app.request(`/api/books/${book.id}/clippings/0123456789abcdef`, { method: 'DELETE', headers: { cookie } }, env);
    expect(missing.status).toBe(404);
    const foreign = await app.request(`/api/books/${otherBook.id}/clippings`, { headers: { cookie } }, env);
    expect(foreign.status).toBe(404);
  });

  it('rejects a literal null body with a standard 400, not a 500', async () => {
    const { cookie } = await createUserAndLogin(env);
    const book = await uploadFixture(env, cookie);
    const res = await app.request(`/api/books/${book.id}/clippings`, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: 'null' }, env);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('validation');
  });

  it('rejects text over 2048 bytes, note over 4096 bytes and chapter over 64 characters', async () => {
    const { cookie } = await createUserAndLogin(env);
    const book = await uploadFixture(env, cookie);
    const longText = 'x'.repeat(2049);
    const wideText = 'é'.repeat(1025); // 2 bytes each -> 2050 bytes, 1025 chars
    const longNote = 'x'.repeat(4097);
    const wideNote = 'é'.repeat(2049); // 2 bytes each -> 4098 bytes, 2049 chars: under no character cap, over the byte cap
    const longChapter = 'x'.repeat(65);
    const bad = [
      { ...NEW, text: longText },
      { ...NEW, text: wideText },
      { ...NEW, note: longNote },
      { ...NEW, note: wideNote },
      { ...NEW, chapter: longChapter },
    ];
    for (const body of bad) {
      const res = await app.request(...jsonRequest(`/api/books/${book.id}/clippings`, 'POST', body, cookie), env);
      expect(res.status).toBe(400);
    }
  });

  it('rejects a cfi over 512 characters on create and on patch', async () => {
    const { cookie } = await createUserAndLogin(env);
    const book = await uploadFixture(env, cookie);
    const longCfi = 'epubcfi(/' + '6/4'.repeat(200) + ')';
    expect(longCfi.length).toBeGreaterThan(512);
    const createRes = await app.request(...jsonRequest(`/api/books/${book.id}/clippings`, 'POST', { ...NEW, cfi: longCfi }, cookie), env);
    expect(createRes.status).toBe(400);
    const created = (await (await app.request(...jsonRequest(`/api/books/${book.id}/clippings`, 'POST', NEW, cookie), env)).json()) as ClippingDto;
    const patchRes = await app.request(...jsonRequest(`/api/books/${book.id}/clippings/${created.id}`, 'PATCH', { cfi: longCfi }, cookie), env);
    expect(patchRes.status).toBe(400);
  });

  it('ignores a client-supplied id and derives its own', async () => {
    const { cookie } = await createUserAndLogin(env);
    const book = await uploadFixture(env, cookie);
    const spoofedId = '0123456789abcdef';
    const res = await app.request(...jsonRequest(`/api/books/${book.id}/clippings`, 'POST', { ...NEW, id: spoofedId }, cookie), env);
    expect(res.status).toBe(201);
    const dto = (await res.json()) as ClippingDto;
    expect(dto.id).not.toBe(spoofedId);
    expect(dto.id).toMatch(/^[0-9a-f]{16}$/);
  });

  it('does not touch dirty or updated_at on an empty-object or literal-null patch body', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    const dto = await uploadFixture(env, cookie);
    const book = (await findBook(env.DB, user.id, dto.id))!;
    const created = (await (await app.request(...jsonRequest(`/api/books/${dto.id}/clippings`, 'POST', NEW, cookie), env)).json()) as ClippingDto;
    const stored = (await findClipping(env.DB, book.id, created.id))!;
    await upsertClipping(env.DB, { ...stored, dirty: 0, updated_at: 1 });

    const emptyRes = await app.request(...jsonRequest(`/api/books/${dto.id}/clippings/${created.id}`, 'PATCH', {}, cookie), env);
    expect(emptyRes.status).toBe(200);
    const afterEmpty = (await findClipping(env.DB, book.id, created.id))!;
    expect(afterEmpty.dirty).toBe(0);
    expect(afterEmpty.updated_at).toBe(1);

    const nullRes = await app.request(`/api/books/${dto.id}/clippings/${created.id}`, { method: 'PATCH', headers: { 'content-type': 'application/json', cookie }, body: 'null' }, env);
    expect(nullRes.status).toBe(200);
    const afterNull = (await findClipping(env.DB, book.id, created.id))!;
    expect(afterNull.dirty).toBe(0);
    expect(afterNull.updated_at).toBe(1);
  });

  it('marks deleted before pushing the tombstone', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    mock.state.users.set('justin', await md5Hex('pw'));
    await app.request(...jsonRequest('/api/sync/settings', 'PUT', { enabled: true, serverUrl: 'https://sync.test', username: 'justin', password: 'pw', hashMethod: 'partial' }, cookie), env);
    const dto = await uploadFixture(env, cookie);
    const book = (await findBook(env.DB, user.id, dto.id))!;
    const created = (await (await app.request(...jsonRequest(`/api/books/${dto.id}/clippings`, 'POST', NEW, cookie), env)).json()) as ClippingDto;

    const del = await app.request(`/api/books/${dto.id}/clippings/${created.id}`, { method: 'DELETE', headers: { cookie } }, env);
    expect(del.status).toBe(204);

    // The create call above already pushed a full record, so the mock's merge
    // semantics (spread previous fields, overwrite what's sent) mean a stored
    // "text" field proves nothing here; only the delete flag distinguishes a
    // tombstone push (row already marked deleted) from a live-row push (not yet).
    const pushed = mock.state.clippings.get(book.hash_partial)?.get(created.id);
    expect(pushed?.deleted).toBe(1);
  });

  it('pulls a server-seeded clipping on sync', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    mock.state.users.set('justin', await md5Hex('pw'));
    await app.request(...jsonRequest('/api/sync/settings', 'PUT', { enabled: true, serverUrl: 'https://sync.test', username: 'justin', password: 'pw', hashMethod: 'partial' }, cookie), env);
    const dto = await uploadFixture(env, cookie);
    const book = (await findBook(env.DB, user.id, dto.id))!;
    const forDoc = new Map();
    forDoc.set('bbbbbbbbbbbbbbbb', {
      id: 'bbbbbbbbbbbbbbbb',
      spine: 1,
      para: 0,
      chapter: 'Chapter 1',
      text: 'remote highlight',
      note: null,
      color: null,
      created_at: 400,
      deleted: 0,
      updated_at: 500,
    });
    mock.state.clippings.set(book.hash_partial, forDoc);

    const res = await app.request(...jsonRequest(`/api/books/${dto.id}/clippings/sync`, 'POST', undefined, cookie), env);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ClippingSyncResponse;
    expect(body.syncError).toBeNull();
    expect(body.clippings.map((cl) => cl.text)).toEqual(['remote highlight']);
  });
});
