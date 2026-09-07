import type { Env } from '../src/worker/env';
import type { BookDto, OpdsScope } from '../src/shared/apiTypes';
import { app } from '../src/worker/app';
import { hashPassword } from '../src/worker/services/crypto';
import { insertUser } from '../src/worker/db/users';
import { listDevices } from '../src/worker/db/devices';
import { randomHex } from '../src/worker/services/crypto';
import { upsertOpdsToken } from '../src/worker/db/opdsTokens';
import { generateOpdsToken, hashOpdsToken } from '../src/worker/services/opdsToken';
import { buildMinimalEpub } from './fixtures/makeMinimalEpub';

export interface TestUser {
  id: string;
  email: string;
  password: string;
  role: 'admin' | 'user';
}

export const createUser = async (
  env: Env,
  opts: { email?: string; password?: string; role?: 'admin' | 'user' } = {},
): Promise<TestUser> => {
  const user: TestUser = {
    id: randomHex(8),
    email: opts.email ?? `${randomHex(4)}@test.local`,
    password: opts.password ?? 'secret-pass-1',
    role: opts.role ?? 'user',
  };
  await insertUser(env.DB, {
    id: user.id,
    email: user.email,
    password_hash: await hashPassword(user.password),
    role: user.role,
    locale: 'vi',
    created_at: Math.floor(Date.now() / 1000),
  });
  return user;
};

export const login = async (env: Env, email: string, password: string): Promise<string> => {
  const res = await app.request(
    '/api/auth/login',
    { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) },
    env,
  );
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${await res.text()}`);
  const setCookie = res.headers.get('set-cookie') ?? '';
  return setCookie.split(';')[0]!;
};

export const createUserAndLogin = async (
  env: Env,
  opts: { email?: string; password?: string; role?: 'admin' | 'user' } = {},
): Promise<{ user: TestUser; cookie: string }> => {
  const user = await createUser(env, opts);
  const cookie = await login(env, user.email, user.password);
  return { user, cookie };
};

export const firstDeviceId = async (env: Env, userId: string): Promise<string> => {
  const rows = await listDevices(env.DB, userId);
  if (rows.length === 0) throw new Error('no device for user');
  return rows[0]!.id;
};

export const fixtureEpub = (): Uint8Array => buildMinimalEpub();

export const uploadFixture = async (env: Env, cookie: string, filename = 'Minimal Book.epub'): Promise<BookDto> => {
  const form = new FormData();
  form.set('file', new File([fixtureEpub()], filename, { type: 'application/epub+zip' }));
  const res = await app.request('/api/books/upload', { method: 'POST', body: form, headers: { cookie } }, env);
  if (res.status !== 201) throw new Error(`upload failed ${res.status} ${await res.text()}`);
  return res.json();
};

export const createOpdsToken = async (env: Env, userId: string, scope: OpdsScope): Promise<string> => {
  const token = generateOpdsToken();
  await upsertOpdsToken(env.DB, userId, scope, await hashOpdsToken(token), Math.floor(Date.now() / 1000));
  return token;
};

export const basicAuth = (token: string): Record<string, string> => ({ authorization: `Basic ${btoa(`koreader:${token}`)}` });

export const jsonRequest = (
  path: string,
  method: string,
  body?: unknown,
  cookie?: string,
): [string, RequestInit] => [
  path,
  {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  },
];
