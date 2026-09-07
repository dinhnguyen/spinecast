import { env } from 'cloudflare:workers';
import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../app';
import { createSession } from '../services/session';

const U = 'hu1';
let token: string;

const post = (bookId: string, body: unknown, t = token) =>
  app.request(
    `/api/books/${bookId}/session`,
    { method: 'POST', headers: { 'content-type': 'application/json', cookie: `session=${t}` }, body: JSON.stringify(body) },
    env,
  );

const rows = async () =>
  (await env.DB.prepare('select * from reading_sessions order by started_at').all<{ id: string; book_id: string; pages: number; seconds: number; ended_at: number; device_id: string | null }>()).results;

const backdate = async (id: string, endedAt: number) => {
  await env.DB.prepare('update reading_sessions set ended_at = ?, started_at = ? where id = ?').bind(endedAt, endedAt - 60, id).run();
};

beforeEach(async () => {
  for (const t of ['reading_sessions', 'book_stats', 'global_stats', 'books', 'devices', 'users']) await env.DB.prepare(`delete from ${t}`).run();
  await env.DB.prepare("insert into users (id, email, password_hash, role, created_at) values (?, ?, 'x', 'user', 1)").bind(U, `${U}@t.local`).run();
  await env.DB.prepare(
    "insert into books (id, user_id, title, author, filename, filesize, r2_key, hash_partial, hash_filename, created_at) values ('hb1', ?, 't', 'a', 'f.epub', 1, 'k', 'h1', 'h2', 1)",
  ).bind(U).run();
  await env.DB.prepare("insert into devices (id, user_id, name, created_at, last_seen_at) values ('hd1', ?, 'Web', 1, 1)").bind(U).run();
  token = await createSession(env, U, 'hd1');
});

describe('reading session heartbeat', () => {
  it('creates a session on the first heartbeat and returns its id', async () => {
    const res = await post('hb1', { sessionId: null, turns: 3 });
    expect(res.status).toBe(200);
    const { sessionId } = await res.json<{ sessionId: string }>();
    expect(sessionId).toBeTruthy();
    const [row] = await rows();
    expect(row!.pages).toBe(3);
    expect(row!.device_id).toBe('hd1');
  });

  it('does nothing when there are no turns and no session', async () => {
    const res = await post('hb1', { sessionId: null, turns: 0 });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ sessionId: null });
    expect(await rows()).toHaveLength(0);
  });

  it('writes absolute values, so a replayed heartbeat changes nothing', async () => {
    const { sessionId } = await (await post('hb1', { sessionId: null, turns: 5 })).json<{ sessionId: string }>();
    await post('hb1', { sessionId, turns: 9 });
    await post('hb1', { sessionId, turns: 9 });
    const all = await rows();
    expect(all).toHaveLength(1);
    expect(all[0]!.pages).toBe(9);
  });

  it('reuses the session across a 299 second gap', async () => {
    const { sessionId } = await (await post('hb1', { sessionId: null, turns: 5 })).json<{ sessionId: string }>();
    await backdate(sessionId, Math.floor(Date.now() / 1000) - 299);
    const again = await (await post('hb1', { sessionId, turns: 7 })).json<{ sessionId: string }>();
    expect(again.sessionId).toBe(sessionId);
    expect(await rows()).toHaveLength(1);
  });

  it('opens a new session after a 301 second gap', async () => {
    const { sessionId } = await (await post('hb1', { sessionId: null, turns: 5 })).json<{ sessionId: string }>();
    await backdate(sessionId, Math.floor(Date.now() / 1000) - 301);
    const again = await (await post('hb1', { sessionId, turns: 7 })).json<{ sessionId: string }>();
    expect(again.sessionId).not.toBe(sessionId);
    expect(await rows()).toHaveLength(2);
  });

  it('opens a new session when the device differs', async () => {
    const { sessionId } = await (await post('hb1', { sessionId: null, turns: 5 })).json<{ sessionId: string }>();
    await env.DB.prepare("insert into devices (id, user_id, name, created_at, last_seen_at) values ('hd2', ?, 'Phone', 1, 1)").bind(U).run();
    const other = await createSession(env, U, 'hd2');
    const again = await (await post('hb1', { sessionId, turns: 7 }, other)).json<{ sessionId: string }>();
    expect(again.sessionId).not.toBe(sessionId);
  });

  it('marks stats dirty', async () => {
    await post('hb1', { sessionId: null, turns: 3 });
    const row = await env.DB.prepare('select dirty from global_stats where user_id = ?').bind(U).first<{ dirty: number }>();
    expect(row!.dirty).toBe(1);
  });

  it('rejects a book that belongs to another user', async () => {
    await env.DB.prepare("insert into users (id, email, password_hash, role, created_at) values ('hu2', 'hu2@t.local', 'x', 'user', 1)").run();
    await env.DB.prepare(
      "insert into books (id, user_id, title, author, filename, filesize, r2_key, hash_partial, hash_filename, created_at) values ('ob1', 'hu2', 't', 'a', 'f.epub', 1, 'k', 'oh1', 'oh2', 1)",
    ).run();
    expect((await post('ob1', { sessionId: null, turns: 1 })).status).toBe(404);
    expect(await rows()).toHaveLength(0);
  });

  it('rejects a negative or non-integer turn count', async () => {
    expect((await post('hb1', { sessionId: null, turns: -1 })).status).toBe(400);
    expect((await post('hb1', { sessionId: null, turns: 1.5 })).status).toBe(400);
  });

  it('counts the turns before a roll once, not twice', async () => {
    const first = await (await post('hb1', { sessionId: null, turns: 50 })).json<{ sessionId: string }>();
    await backdate(first.sessionId, Math.floor(Date.now() / 1000) - 301);
    // A heartbeat carrying the same 50 turns rolls the session. Those 50 belong
    // to the row that already holds them; the new row starts empty.
    const rolled = await (await post('hb1', { sessionId: first.sessionId, turns: 50 })).json<{ sessionId: string }>();
    expect(rolled.sessionId).not.toBe(first.sessionId);
    const all = await rows();
    expect(all).toHaveLength(2);
    expect(all.reduce((n, r) => n + r.pages, 0)).toBe(50);

    // The rebased client counts from zero into the new row.
    await post('hb1', { sessionId: rolled.sessionId, turns: 3 });
    expect((await rows()).map((r) => r.pages)).toEqual([50, 3]);
  });

  it('does not attribute one book turns to another book session', async () => {
    await env.DB.prepare(
      "insert into books (id, user_id, title, author, filename, filesize, r2_key, hash_partial, hash_filename, created_at) values ('hb2', ?, 't2', 'a', 'g.epub', 1, 'k2', 'h3', 'h4', 1)",
    ).bind(U).run();
    const { sessionId } = await (await post('hb1', { sessionId: null, turns: 5 })).json<{ sessionId: string }>();
    const again = await (await post('hb2', { sessionId, turns: 7 })).json<{ sessionId: string }>();
    expect(again.sessionId).not.toBe(sessionId);
    const all = await rows();
    expect(all).toHaveLength(2);
    expect(all.find((r) => r.id === sessionId)).toMatchObject({ book_id: 'hb1', pages: 5 });
  });

  it('requires authentication', async () => {
    const res = await app.request(
      '/api/books/hb1/session',
      { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"sessionId":null,"turns":1}' },
      env,
    );
    expect(res.status).toBe(401);
  });
});
