import type { AdminBookDto, AdminBooksPageDto, AdminBookSort } from '../../shared/apiTypes';
import { ApiError } from '../errors';

const PAGE_SIZE = 50;

interface AdminBookRow {
  id: string;
  ownerId: string;
  ownerEmail: string;
  filename: string;
  filesize: number;
  shared: number;
  blobHash: string | null;
  blobRefs: number;
  createdAt: number;
}

type Cursor = { s: 'size'; k: [number, string] } | { s: 'owner'; k: [string, string] } | { s: 'shared'; k: [number, number, string] };

const BASE = `select b.id, b.user_id as ownerId, u.email as ownerEmail, b.filename, b.filesize,
  b.shared, b.blob_hash as blobHash,
  case when b.blob_hash is null then 1 else (select count(*) from books refs where refs.blob_hash = b.blob_hash) end as blobRefs,
  b.created_at as createdAt
  from books b join users u on u.id = b.user_id`;

const encodeCursor = (cursor: Cursor): string => {
  const bytes = new TextEncoder().encode(JSON.stringify(cursor));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
};

const invalidCursor = (): never => {
  throw new ApiError(400, 'validation', 'Invalid cursor');
};

const decodeCursor = (value: string | null, sort: AdminBookSort): Cursor | null => {
  if (!value) return null;
  try {
    const base64 = value.replaceAll('-', '+').replaceAll('_', '/');
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));
    const parsed = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)))) as Partial<Cursor>;
    if (parsed.s !== sort || !Array.isArray(parsed.k)) return invalidCursor();
    if (sort === 'size' && parsed.k.length === 2 && typeof parsed.k[0] === 'number' && typeof parsed.k[1] === 'string') return parsed as Cursor;
    if (sort === 'owner' && parsed.k.length === 2 && typeof parsed.k[0] === 'string' && typeof parsed.k[1] === 'string') return parsed as Cursor;
    if (sort === 'shared' && parsed.k.length === 3 && typeof parsed.k[0] === 'number' && typeof parsed.k[1] === 'number' && typeof parsed.k[2] === 'string') return parsed as Cursor;
    return invalidCursor();
  } catch (error) {
    if (error instanceof ApiError) throw error;
    return invalidCursor();
  }
};

const toDto = (row: AdminBookRow): AdminBookDto => ({
  id: row.id,
  ownerId: row.ownerId,
  ownerEmail: row.ownerEmail,
  filename: row.filename,
  filesize: row.filesize,
  shared: row.shared === 1,
  blobHash: row.blobHash,
  blobRefs: row.blobRefs,
  createdAt: row.createdAt,
});

export const listAdminBooks = async (db: D1Database, sort: AdminBookSort, cursorValue: string | null): Promise<AdminBooksPageDto> => {
  const cursor = decodeCursor(cursorValue, sort);
  let sql = `select * from (${BASE}) rows`;
  let bindings: Array<string | number> = [];
  if (sort === 'size') {
    if (cursor?.s === 'size') {
      sql += ' where (filesize < ? or (filesize = ? and id > ?))';
      bindings = [cursor.k[0], cursor.k[0], cursor.k[1]];
    }
    sql += ' order by filesize desc, id asc';
  } else if (sort === 'owner') {
    if (cursor?.s === 'owner') {
      sql += ' where (ownerEmail > ? or (ownerEmail = ? and id > ?))';
      bindings = [cursor.k[0], cursor.k[0], cursor.k[1]];
    }
    sql += ' order by ownerEmail asc, id asc';
  } else {
    if (cursor?.s === 'shared') {
      sql += ' where (blobRefs < ? or (blobRefs = ? and (filesize < ? or (filesize = ? and id > ?))))';
      bindings = [cursor.k[0], cursor.k[0], cursor.k[1], cursor.k[1], cursor.k[2]];
    }
    sql += ' order by blobRefs desc, filesize desc, id asc';
  }
  const result = await db.prepare(`${sql} limit ${PAGE_SIZE + 1}`).bind(...bindings).all<AdminBookRow>();
  const rows = result.results.slice(0, PAGE_SIZE);
  const last = rows.at(-1);
  const nextCursor = result.results.length > PAGE_SIZE && last
    ? encodeCursor(
        sort === 'size'
          ? { s: sort, k: [last.filesize, last.id] }
          : sort === 'owner'
            ? { s: sort, k: [last.ownerEmail, last.id] }
            : { s: sort, k: [last.blobRefs, last.filesize, last.id] },
      )
    : null;
  return { items: rows.map(toDto), nextCursor };
};
