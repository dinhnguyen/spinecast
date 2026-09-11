import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { app } from '../app';
import { createUserAndLogin, jsonRequest, uploadFixture } from '../../../test/helpers';
import { REHASH_BATCH, rehashBooks } from './rehashBooks';

const hashOf = (id: string): Promise<{ hash_partial: string } | null> =>
  env.DB.prepare('select hash_partial from books where id = ?').bind(id).first<{ hash_partial: string }>();

describe('rehashBooks', () => {
  it('rewrites a stale hash and leaves a correct one alone', async () => {
    const { cookie } = await createUserAndLogin(env);
    const book = await uploadFixture(env, cookie);
    const correct = (await hashOf(book.id))!.hash_partial;

    await env.DB.prepare('update books set hash_partial = ? where id = ?').bind('stale', book.id).run();
    const first = await rehashBooks(env.DB, env.BOOKS, null);
    expect(first.updated).toBeGreaterThanOrEqual(1);
    expect((await hashOf(book.id))!.hash_partial).toBe(correct);

    // Second pass over the same rows has nothing left to write.
    const second = await rehashBooks(env.DB, env.BOOKS, null);
    expect(second.updated).toBe(0);
    expect((await hashOf(book.id))!.hash_partial).toBe(correct);
  });

  it('reproduces exactly what ingest computes, so a rehashed book still dedups on re-upload', async () => {
    const { cookie } = await createUserAndLogin(env);
    const book = await uploadFixture(env, cookie);
    const atIngest = (await hashOf(book.id))!.hash_partial;
    await env.DB.prepare('update books set hash_partial = ? where id = ?').bind('stale', book.id).run();
    await rehashBooks(env.DB, env.BOOKS, null);
    expect((await hashOf(book.id))!.hash_partial).toBe(atIngest);
  });

  it('counts a book whose object is gone as missing and leaves its row untouched', async () => {
    const { cookie } = await createUserAndLogin(env);
    const book = await uploadFixture(env, cookie);
    const key = (await env.DB.prepare('select r2_key from books where id = ?').bind(book.id).first<{ r2_key: string }>())!.r2_key;
    await env.DB.prepare('update books set hash_partial = ? where id = ?').bind('sentinel', book.id).run();
    await env.BOOKS.delete(key);

    const res = await rehashBooks(env.DB, env.BOOKS, null);
    expect(res.missing).toBeGreaterThanOrEqual(1);
    expect((await hashOf(book.id))!.hash_partial).toBe('sentinel');
  });

  it('hands back a cursor while a full batch remains and null on the short one', async () => {
    const { user } = await createUserAndLogin(env);
    // Rows only - no R2 objects, so these count as missing. Paging is what is
    // under test here, and it runs before any object is read.
    const insert = env.DB.prepare(
      `insert into books (id, user_id, title, author, filename, filesize, r2_key, hash_partial, hash_filename, created_at)
       values (?, ?, 'T', 'A', 'f.epub', 1, ?, ?, 'h', 1)`,
    );
    await env.DB.batch(
      Array.from({ length: REHASH_BATCH + 5 }, (_, i) => {
        const id = `page-${String(i).padStart(3, '0')}`;
        // books carries unique(user_id, hash_partial), so each row needs its own.
        return insert.bind(id, user.id, `books/${id}.epub`, `hash-${id}`);
      }),
    );

    const first = await rehashBooks(env.DB, env.BOOKS, 'page-');
    expect(first.scanned).toBe(REHASH_BATCH);
    expect(first.cursor).toBe(`page-${String(REHASH_BATCH - 1).padStart(3, '0')}`);

    const second = await rehashBooks(env.DB, env.BOOKS, first.cursor);
    expect(second.scanned).toBe(5);
    expect(second.cursor).toBeNull();
  });
});

describe('admin rehash route', () => {
  it('requires an admin', async () => {
    const plain = await createUserAndLogin(env);
    expect((await app.request(...jsonRequest('/api/admin/overview/rehash', 'POST', undefined), env)).status).toBe(401);
    const denied = await app.request(...jsonRequest('/api/admin/overview/rehash', 'POST', undefined, plain.cookie), env);
    expect(denied.status).toBe(403);
  });

  it('returns exactly the four documented fields', async () => {
    const admin = await createUserAndLogin(env, { role: 'admin' });
    const res = await app.request(...jsonRequest('/api/admin/overview/rehash', 'POST', undefined, admin.cookie), env);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(['cursor', 'missing', 'scanned', 'updated'].sort());
  });
});
