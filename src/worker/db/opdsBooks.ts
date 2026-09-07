import type { OpdsScope } from '../../shared/apiTypes';
import type { BookRow } from './books';

export const OPDS_PAGE_SIZE = 50;

export interface OpdsPage {
  rows: BookRow[];
  hasMore: boolean;
}

export interface OpdsListOptions {
  order: 'title' | 'recent';
  author?: string;
  q?: string;
  page: number;
}

const scopeSql = (scope: OpdsScope): string => (scope === 'public' ? ' and shared = 1' : '');

export const listOpdsBooks = async (db: D1Database, userId: string, scope: OpdsScope, opts: OpdsListOptions): Promise<OpdsPage> => {
  const where: string[] = ['user_id = ?'];
  const binds: (string | number)[] = [userId];
  if (opts.author !== undefined) {
    where.push('author = ?');
    binds.push(opts.author);
  }
  if (opts.q !== undefined) {
    where.push('(title like ? or author like ?)');
    binds.push(`%${opts.q}%`, `%${opts.q}%`);
  }
  const order = opts.order === 'recent' ? 'created_at desc, title collate nocase' : 'title collate nocase, created_at desc';
  const offset = (Math.max(1, opts.page) - 1) * OPDS_PAGE_SIZE;
  const res = await db
    .prepare(`select * from books where ${where.join(' and ')}${scopeSql(scope)} order by ${order} limit ? offset ?`)
    .bind(...binds, OPDS_PAGE_SIZE + 1, offset)
    .all<BookRow>();
  const rows = res.results.slice(0, OPDS_PAGE_SIZE);
  return { rows, hasMore: res.results.length > OPDS_PAGE_SIZE };
};

export const listOpdsAuthors = async (db: D1Database, userId: string, scope: OpdsScope): Promise<{ author: string; count: number }[]> => {
  const res = await db
    .prepare(`select author, count(*) as count from books where user_id = ?${scopeSql(scope)} group by author order by author collate nocase`)
    .bind(userId)
    .all<{ author: string; count: number }>();
  return res.results;
};

export const findOpdsBook = (db: D1Database, userId: string, scope: OpdsScope, bookId: string): Promise<BookRow | null> =>
  db.prepare(`select * from books where user_id = ? and id = ?${scopeSql(scope)}`).bind(userId, bookId).first<BookRow>();

export const countSharedBooks = async (db: D1Database, userId: string): Promise<number> => {
  const row = await db.prepare('select count(*) as n from books where user_id = ? and shared = 1').bind(userId).first<{ n: number }>();
  return row?.n ?? 0;
};
