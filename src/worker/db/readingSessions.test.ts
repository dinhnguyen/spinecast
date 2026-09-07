import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { findSession, insertSession, listFinishedBookIds, listSessions, updateSessionProgress } from './readingSessions';
import { isGlobalDirty, markStatsDirty, readGlobalStats, saveStats } from './stats';
import { recomputeStats } from '../services/recomputeStats';

const U = 'su1';

const seed = async () => {
  await env.DB.prepare("insert into users (id, email, password_hash, role, created_at) values (?, ?, 'x', 'user', 1)").bind(U, `${U}@t.local`).run();
  for (const b of ['sb1', 'sb2']) {
    await env.DB.prepare(
      "insert into books (id, user_id, title, author, filename, filesize, r2_key, hash_partial, hash_filename, created_at) values (?, ?, 't', 'a', 'f.epub', 1, 'k', ?, ?, 1)",
    ).bind(b, U, b, b).run();
  }
};

beforeEach(async () => {
  for (const t of ['reading_progress', 'reading_sessions', 'book_stats', 'global_stats', 'books', 'users']) {
    await env.DB.prepare(`delete from ${t}`).run();
  }
  await seed();
});

describe('reading sessions', () => {
  it('round-trips a session and updates it in place', async () => {
    await insertSession(env.DB, { id: 's1', user_id: U, book_id: 'sb1', started_at: 100, ended_at: 100, seconds: 0, pages: 0, device_id: 'd1' });
    await updateSessionProgress(env.DB, 's1', 12, 300, 400);
    const row = await findSession(env.DB, U, 's1');
    expect(row).toMatchObject({ id: 's1', pages: 12, seconds: 300, ended_at: 400, device_id: 'd1' });
  });

  it('scopes lookup to the owning user', async () => {
    await insertSession(env.DB, { id: 's1', user_id: U, book_id: 'sb1', started_at: 100, ended_at: 100, seconds: 0, pages: 0, device_id: null });
    expect(await findSession(env.DB, 'someone-else', 's1')).toBeNull();
  });

  it('lists sessions oldest first', async () => {
    await insertSession(env.DB, { id: 'b', user_id: U, book_id: 'sb1', started_at: 200, ended_at: 200, seconds: 0, pages: 0, device_id: null });
    await insertSession(env.DB, { id: 'a', user_id: U, book_id: 'sb1', started_at: 100, ended_at: 100, seconds: 0, pages: 0, device_id: null });
    expect((await listSessions(env.DB, U)).map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('does not list another user sessions', async () => {
    const other = 'su3';
    await env.DB.prepare("insert into users (id, email, password_hash, role, created_at) values (?, ?, 'x', 'user', 1)").bind(other, `${other}@t.local`).run();
    await env.DB.prepare(
      "insert into books (id, user_id, title, author, filename, filesize, r2_key, hash_partial, hash_filename, created_at) values ('osb1', ?, 't', 'a', 'f.epub', 1, 'k', 'osb1', 'osb1', 1)",
    ).bind(other).run();
    await insertSession(env.DB, { id: 'mine', user_id: U, book_id: 'sb1', started_at: 100, ended_at: 100, seconds: 0, pages: 0, device_id: null });
    await insertSession(env.DB, { id: 'theirs', user_id: other, book_id: 'osb1', started_at: 200, ended_at: 200, seconds: 0, pages: 0, device_id: null });
    expect((await listSessions(env.DB, U)).map((r) => r.id)).toEqual(['mine']);
  });

  it('returns only books at or past the finished threshold', async () => {
    await env.DB.prepare('insert into reading_progress (book_id, pct_q, spine, updated_at) values (?, ?, 0, 1)').bind('sb1', 999_000).run();
    await env.DB.prepare('insert into reading_progress (book_id, pct_q, spine, updated_at) values (?, ?, 0, 1)').bind('sb2', 998_999).run();
    expect(await listFinishedBookIds(env.DB, U, 999_000)).toEqual(['sb1']);
  });

  it('does not leak another user finished book through reading_progress', async () => {
    const other = 'su2';
    await env.DB.prepare("insert into users (id, email, password_hash, role, created_at) values (?, ?, 'x', 'user', 1)").bind(other, `${other}@t.local`).run();
    await env.DB.prepare(
      "insert into books (id, user_id, title, author, filename, filesize, r2_key, hash_partial, hash_filename, created_at) values ('ob1', ?, 't', 'a', 'f.epub', 1, 'k', 'ob1', 'ob1', 1)",
    ).bind(other).run();
    await env.DB.prepare('insert into reading_progress (book_id, pct_q, spine, updated_at) values (?, ?, 0, 1)').bind('ob1', 999_000).run();
    expect(await listFinishedBookIds(env.DB, U, 999_000)).not.toContain('ob1');
  });
});

describe('stats cache', () => {
  it('starts clean and goes dirty on demand', async () => {
    const { global, books } = recomputeStats([], new Set(), 'UTC', 1000);
    await saveStats(env.DB, U, global, books);
    expect(await isGlobalDirty(env.DB, U)).toBe(false);
    await markStatsDirty(env.DB, U, 'sb1');
    expect(await isGlobalDirty(env.DB, U)).toBe(true);
  });

  it('treats an absent row as dirty', async () => {
    expect(await isGlobalDirty(env.DB, U)).toBe(true);
  });

  it('round-trips saved values', async () => {
    const { global, books } = recomputeStats(
      [{ book_id: 'sb1', started_at: 1788652800, ended_at: 1788656400, pages: 40 }],
      new Set(['sb1']),
      'UTC',
      1788660000,
    );
    await saveStats(env.DB, U, global, books);
    const back = await readGlobalStats(env.DB, U);
    expect(back).toMatchObject({
      sessions: 1,
      seconds: 3600,
      pages: 40,
      completed: 1,
      tod: global.tod,
      dow: global.dow,
      history_b64: global.history_b64,
    });
  });

  it('a second save overwrites every column from the first', async () => {
    const first = recomputeStats(
      [{ book_id: 'sb1', started_at: 1788652800, ended_at: 1788656400, pages: 40 }],
      new Set(['sb1']),
      'UTC',
      1788660000,
    );
    await saveStats(env.DB, U, first.global, first.books);

    const second = recomputeStats(
      [
        { book_id: 'sb1', started_at: 1788652800, ended_at: 1788660000, pages: 100 },
        { book_id: 'sb1', started_at: 1788742800, ended_at: 1788744600, pages: 20 },
      ],
      new Set(),
      'UTC',
      1788860000,
    );
    await saveStats(env.DB, U, second.global, second.books);

    const back = await readGlobalStats(env.DB, U);
    expect(back).toMatchObject({
      sessions: 2,
      seconds: 9000,
      pages: 120,
      completed: 0,
      tod: second.global.tod,
      dow: second.global.dow,
      anchor_day: second.global.anchor_day,
      history_b64: second.global.history_b64,
      streak: second.global.streak,
    });
  });
});
