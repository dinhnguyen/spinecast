import type { BookRow } from '../db/books';
import { deleteBookAndBlob } from './deleteBook';

export const deleteUser = async (db: D1Database, bucket: R2Bucket, userId: string): Promise<void> => {
  const books = await db.prepare('select * from books where user_id = ? order by id')
    .bind(userId).all<BookRow>();
  for (const book of books.results) await deleteBookAndBlob(db, bucket, book);
  await db.batch([
    db.prepare('update invites set used_by = null where used_by = ?').bind(userId),
    db.prepare('delete from invites where created_by = ?').bind(userId),
    db.prepare('delete from password_resets where created_by = ?').bind(userId),
    db.prepare('delete from users where id = ?').bind(userId),
  ]);
};
