import { env } from 'cloudflare:workers';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { findBook, insertBook } from '../db/books';
import { findUserById } from '../db/users';
import { randomHex } from '../services/crypto';
import { createUser } from '../../../test/helpers';
import * as deleteBookModule from './deleteBook';
import { deleteUser } from './deleteUser';

const id = (prefix: string): string => `${prefix}-${randomHex(8)}`;

const makeBook = (userId: string) => ({
  id: id('book'),
  user_id: userId,
  title: 'T',
  author: 'A',
  filename: 'f.epub',
  filesize: 10,
  r2_key: id('r2'),
  cover_r2_key: null,
  shared: 0,
  hash_partial: id('partial'),
  hash_filename: id('filename'),
  blob_hash: null,
  created_at: 1,
  last_opened_at: null,
  source_catalog_id: null,
  source_entry_id: null,
});

describe('deleteUser', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('is retryable when a book deletion fails partway through, without running the final cleanup batch', async () => {
    const user = await createUser(env);
    const book1 = makeBook(user.id);
    const book2 = makeBook(user.id);
    await insertBook(env.DB, book1);
    await insertBook(env.DB, book2);

    // The service visits books in `order by id`, and book ids are random hex
    // suffixes, so figure out at runtime which book actually comes first.
    const [firstBook, secondBook] = book1.id < book2.id ? [book1, book2] : [book2, book1];

    const real = deleteBookModule.deleteBookAndBlob;
    const spy = vi.spyOn(deleteBookModule, 'deleteBookAndBlob');
    spy.mockImplementationOnce((db, bucket, book) => real(db, bucket, book));
    spy.mockImplementationOnce(() => Promise.reject(new Error('boom')));

    await expect(deleteUser(env.DB, env.BOOKS, user.id)).rejects.toThrow('boom');

    // First book gone, second book and the user row untouched by the failed batch.
    expect(await findBook(env.DB, user.id, firstBook.id)).toBeNull();
    expect(await findBook(env.DB, user.id, secondBook.id)).not.toBeNull();
    expect(await findUserById(env.DB, user.id)).not.toBeNull();

    spy.mockRestore();
    await deleteUser(env.DB, env.BOOKS, user.id);

    expect(await findBook(env.DB, user.id, secondBook.id)).toBeNull();
    expect(await findUserById(env.DB, user.id)).toBeNull();
  });
});
