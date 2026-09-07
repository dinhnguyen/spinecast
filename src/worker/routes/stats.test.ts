import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../app';
import { createSession } from '../services/session';
import type { StatsDto } from '../../shared/apiTypes';
import { listSessions } from '../db/readingSessions';
import { saveStats } from '../db/stats';
import { recomputeStats } from '../services/recomputeStats';
import { localDay } from '../services/localTime';

const U = 'stu1';
let token: string;

const get = () => app.request('/api/stats', { headers: { cookie: `session=${token}` } }, env);

const addSession = async (id: string, startedAt: number, endedAt: number, pages: number) => {
  await env.DB.prepare(
    'insert into reading_sessions (id, user_id, book_id, started_at, ended_at, seconds, pages, device_id) values (?, ?, ?, ?, ?, ?, ?, ?)',
  ).bind(id, U, 'stb1', startedAt, endedAt, endedAt - startedAt, pages, 'std1').run();
  await env.DB.prepare('insert into global_stats (user_id, dirty) values (?, 1) on conflict(user_id) do update set dirty = 1').bind(U).run();
};

beforeEach(async () => {
  for (const t of ['reading_progress', 'reading_sessions', 'book_stats', 'global_stats', 'books', 'devices', 'users']) {
    await env.DB.prepare(`delete from ${t}`).run();
  }
  await env.DB.prepare("insert into users (id, email, password_hash, role, created_at, timezone) values (?, ?, 'x', 'user', 1, 'UTC')").bind(U, `${U}@t.local`).run();
  await env.DB.prepare(
    "insert into books (id, user_id, title, author, filename, filesize, r2_key, hash_partial, hash_filename, created_at) values ('stb1', ?, 't', 'a', 'f.epub', 1, 'k', 'h1', 'h2', 1)",
  ).bind(U).run();
  await env.DB.prepare("insert into devices (id, user_id, name, created_at, last_seen_at) values ('std1', ?, 'Web', 1, 1)").bind(U).run();
  token = await createSession(env, U, 'std1');
});

describe('GET /api/stats', () => {
  it('returns zeroes for a user with no sessions', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const dto = await res.json<StatsDto>();
    expect(dto.sessions).toBe(0);
    expect(dto.tod).toEqual([0, 0, 0, 0]);
    expect(dto.dow).toEqual([0, 0, 0, 0, 0, 0, 0]);
    expect(dto.timezone).toBe('UTC');
  });

  it('recomputes from sessions and clears the dirty flag', async () => {
    const now = Math.floor(Date.now() / 1000);
    // Anchored inside one UTC day: a session ending at `now` straddles midnight
    // whenever the suite runs in the first hour of a UTC day, and reading across
    // midnight legitimately counts as two days.
    const start = Math.floor(now / 86400) * 86400 - 86400 + 12 * 3600;
    await addSession('x1', start, start + 3600, 40);
    const dto = await (await get()).json<StatsDto>();
    expect(dto.sessions).toBe(1);
    expect(dto.seconds).toBe(3600);
    expect(dto.pages).toBe(40);
    expect(dto.currentStreak).toBe(1);
    const row = await env.DB.prepare('select dirty from global_stats where user_id = ?').bind(U).first<{ dirty: number }>();
    expect(row!.dirty).toBe(0);
  });

  it('serves the cache when clean and does not resurrect deleted sessions', async () => {
    const now = Math.floor(Date.now() / 1000);
    await addSession('x1', now - 3600, now, 40);
    await get();
    await env.DB.prepare('delete from reading_sessions').run();
    const dto = await (await get()).json<StatsDto>();
    expect(dto.sessions).toBe(1);
  });

  it('counts a book past the finished threshold', async () => {
    const now = Math.floor(Date.now() / 1000);
    await addSession('x1', now - 3600, now, 40);
    await env.DB.prepare('insert into reading_progress (book_id, pct_q, spine, updated_at) values (?, ?, 0, 1)').bind('stb1', 999_500).run();
    const dto = await (await get()).json<StatsDto>();
    expect(dto.completed).toBe(1);
  });

  it('recomputes when the cached anchor day is no longer today', async () => {
    const now = Math.floor(Date.now() / 1000);
    const midnight = Math.floor(now / 86400) * 86400;
    // Four consecutive reading days, the most recent of them ten days ago.
    for (let i = 0; i < 4; i++) {
      const start = midnight - (10 + i) * 86400 + 12 * 3600;
      await addSession(`old${i}`, start, start + 3600, 40);
    }
    // The cache as it was written on the last of those days: bit 0 is that day.
    const stale = recomputeStats(await listSessions(env.DB, U), new Set(), 'UTC', midnight - 10 * 86400 + 12 * 3600);
    expect(stale.global.current_streak).toBe(4);
    await saveStats(env.DB, U, stale.global, stale.books);

    const dto = await (await get()).json<StatsDto>();
    expect(dto.anchorDay).toBe(localDay(now, 'UTC'));
    expect(dto.currentStreak).toBe(0);
    expect(dto.streak).toBe(4);
  });

  it('buckets in the user timezone, not UTC', async () => {
    await env.DB.prepare('update users set timezone = ? where id = ?').bind('Asia/Ho_Chi_Minh', U).run();
    const midnight = Math.floor(Date.now() / 1000 / 86400) * 86400;
    // 19:00Z is 02:00 the next day in Ho Chi Minh: night, not evening.
    const start = midnight - 86400 + 19 * 3600;
    await addSession('tz1', start, start + 3600, 10);
    const dto = await (await get()).json<StatsDto>();
    expect(dto.timezone).toBe('Asia/Ho_Chi_Minh');
    expect(dto.tod).toEqual([0, 0, 0, 3600]);
  });

  it('ships per-day minutes alongside the bitmap', async () => {
    const midnight = Math.floor(Date.now() / 1000 / 86400) * 86400;
    await addSession('m1', midnight + 8 * 3600, midnight + 8 * 3600 + 2700, 20);
    const dto = await (await get()).json<StatsDto>();
    const buf = Uint8Array.from(atob(dto.minutesB64), (c) => c.charCodeAt(0));
    expect((buf[0] ?? 0) | ((buf[1] ?? 0) << 8)).toBe(45);
  });

  it('requires authentication', async () => {
    expect((await app.request('/api/stats', {}, env)).status).toBe(401);
  });
});
