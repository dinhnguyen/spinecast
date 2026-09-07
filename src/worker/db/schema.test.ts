import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';

const EXPECTED = [
  'users', 'invites', 'books', 'sync_settings', 'reading_progress',
  'bookmarks', 'clippings', 'sync_cursors', 'reading_sessions', 'book_stats', 'global_stats',
];

describe('schema', () => {
  it('creates every table from the spec', async () => {
    const rows = await env.DB.prepare(
      "select name from sqlite_master where type = 'table' and name not like 'sqlite_%' and name not like 'd1_%' order by name",
    ).all<{ name: string }>();
    const names = rows.results.map((r) => r.name);
    for (const t of EXPECTED) expect(names).toContain(t);
  });

  it('enforces one book per user per partial hash', async () => {
    await env.DB.prepare("insert into users (id, email, password_hash, role, created_at) values ('u1', 'a@b.c', 'x', 'user', 1)").run();
    const ins = "insert into books (id, user_id, title, author, filename, filesize, r2_key, hash_partial, hash_filename, created_at) values (?, 'u1', 't', 'a', 'f.epub', 1, 'k', 'h1', 'h2', 1)";
    await env.DB.prepare(ins).bind('b1').run();
    await expect(env.DB.prepare(ins).bind('b2').run()).rejects.toThrow();
  });
});

describe('opds schema', () => {
  it('adds books.shared with default 0', async () => {
    const cols = await env.DB.prepare('pragma table_info(books)').all<{ name: string; dflt_value: string | null; notnull: number }>();
    const shared = cols.results.find((c) => c.name === 'shared');
    expect(shared).toBeDefined();
    expect(shared!.notnull).toBe(1);
    expect(shared!.dflt_value).toBe('0');
  });

  it('creates opds_tokens keyed by user and scope', async () => {
    await env.DB.prepare(`insert into users (id, email, password_hash, role, created_at) values ('ou1', 'ou1@test.local', 'x', 'user', 1)`).run();
    await env.DB.prepare(`insert into opds_tokens (user_id, scope, token_hash, created_at) values ('ou1', 'library', 'h1', 1)`).run();
    await expect(
      env.DB.prepare(`insert into opds_tokens (user_id, scope, token_hash, created_at) values ('ou1', 'library', 'h2', 2)`).run(),
    ).rejects.toThrow();
    await expect(
      env.DB.prepare(`insert into opds_tokens (user_id, scope, token_hash, created_at) values ('ou1', 'other', 'h3', 3)`).run(),
    ).rejects.toThrow();
    await env.DB.prepare(`delete from users where id = 'ou1'`).run();
    const left = await env.DB.prepare(`select count(*) as n from opds_tokens where user_id = 'ou1'`).first<{ n: number }>();
    expect(left!.n).toBe(0);
  });
});

describe('reading stats schema', () => {
  const col = async (table: string, name: string) => {
    const cols = await env.DB.prepare(`pragma table_info(${table})`).all<{
      name: string;
      notnull: number;
      dflt_value: string | null;
    }>();
    return cols.results.find((c) => c.name === name);
  };

  it('adds users.timezone defaulting to empty', async () => {
    const c = await col('users', 'timezone');
    expect(c).toBeDefined();
    expect(c!.notnull).toBe(1);
    expect(c!.dflt_value).toBe("''");
  });

  it('adds a nullable reading_sessions.device_id', async () => {
    const c = await col('reading_sessions', 'device_id');
    expect(c).toBeDefined();
    expect(c!.notnull).toBe(0);
  });

  it('adds global_stats.minutes_b64 defaulting to empty', async () => {
    const c = await col('global_stats', 'minutes_b64');
    expect(c).toBeDefined();
    expect(c!.notnull).toBe(1);
    expect(c!.dflt_value).toBe("''");
  });

  it('adds dirty flags defaulting to 0', async () => {
    for (const t of ['book_stats', 'global_stats']) {
      const c = await col(t, 'dirty');
      expect(c, t).toBeDefined();
      expect(c!.notnull, t).toBe(1);
      expect(c!.dflt_value, t).toBe('0');
    }
  });
});

describe('opds catalogs schema', () => {
  it('creates opds_catalogs with the nine columns', async () => {
    const cols = await env.DB.prepare('pragma table_info(opds_catalogs)').all<{ name: string }>();
    const names = cols.results.map((c) => c.name);
    expect(names).toEqual(
      expect.arrayContaining(['id', 'user_id', 'name', 'url', 'username', 'password_enc', 'created_at', 'last_ok_at', 'last_error']),
    );
  });

  it('adds source columns to books', async () => {
    const cols = await env.DB.prepare('pragma table_info(books)').all<{ name: string }>();
    const names = cols.results.map((c) => c.name);
    expect(names).toEqual(expect.arrayContaining(['source_catalog_id', 'source_entry_id']));
  });
});

describe('passkey schema', () => {
  it('creates passkeys keyed by the credential id', async () => {
    const cols = await env.DB.prepare('pragma table_info(passkeys)').all<{ name: string; notnull: number; dflt_value: string | null; pk: number }>();
    const by = new Map(cols.results.map((c) => [c.name, c]));
    expect([...by.keys()].sort()).toEqual(['counter', 'created_at', 'id', 'last_used_at', 'name', 'public_key', 'transports', 'user_id']);
    expect(by.get('id')!.pk).toBe(1);
    expect(by.get('last_used_at')!.notnull).toBe(0);
    expect(by.get('counter')!.dflt_value).toBe('0');
    expect(by.get('transports')!.dflt_value).toBe("''");
    for (const name of ['user_id', 'public_key', 'name', 'created_at']) expect(by.get(name)!.notnull, name).toBe(1);
  });
});
