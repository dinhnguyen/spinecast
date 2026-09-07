import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { app } from '../app';
import { createUserAndLogin, firstDeviceId, jsonRequest, uploadFixture } from '../../../test/helpers';
import type { ProgressResponse } from '../../shared/apiTypes';

describe('progress', () => {
  it('stores and returns progress, and stamps last_opened_at', async () => {
    const { cookie } = await createUserAndLogin(env);
    const book = await uploadFixture(env, cookie);
    const put = await app.request(
      ...jsonRequest(`/api/books/${book.id}/progress`, 'PUT', { pctQ: 123456, spine: 1, xpath: '/body/DocFragment[2]/body/p[3]/text()[1].4', para: 3 }, cookie),
      env,
    );
    expect(put.status).toBe(200);
    const body = await put.json();
    expect(body.local.pctQ).toBe(123456);
    expect(body.pushed).toBe(false);
    const get = await app.request(...jsonRequest(`/api/books/${book.id}/progress`, 'GET', undefined, cookie), env);
    const got = await get.json();
    expect(got.local.xpath).toBe('/body/DocFragment[2]/body/p[3]/text()[1].4');
    expect(got.remote).toBeNull();
    const list = await app.request(...jsonRequest('/api/books', 'GET', undefined, cookie), env);
    const item = (await list.json()).items[0];
    expect(item.progress.pctQ).toBe(123456);
    expect(item.lastOpenedAt).not.toBeNull();
  });

  it('validates the body', async () => {
    const { cookie } = await createUserAndLogin(env);
    const book = await uploadFixture(env, cookie);
    const res = await app.request(...jsonRequest(`/api/books/${book.id}/progress`, 'PUT', { pctQ: 2_000_000, spine: 0 }, cookie), env);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe('validation');
  });

  it('404s for another user book', async () => {
    const a = await createUserAndLogin(env);
    const b = await createUserAndLogin(env);
    const book = await uploadFixture(env, a.cookie);
    const res = await app.request(...jsonRequest(`/api/books/${book.id}/progress`, 'PUT', { pctQ: 1, spine: 0 }, b.cookie), env);
    expect(res.status).toBe(404);
  });

  it('accepts POST with the same body, for navigator.sendBeacon', async () => {
    const { cookie } = await createUserAndLogin(env);
    const book = await uploadFixture(env, cookie);
    const post = await app.request(
      ...jsonRequest(`/api/books/${book.id}/progress`, 'POST', { pctQ: 654321, spine: 2, xpath: '/body/DocFragment[3]/body/p[1]', para: 1 }, cookie),
      env,
    );
    expect(post.status).toBe(200);
    const body = await post.json();
    expect(body.local.pctQ).toBe(654321);
    const get = await app.request(...jsonRequest(`/api/books/${book.id}/progress`, 'GET', undefined, cookie), env);
    const got = await get.json();
    expect(got.local.pctQ).toBe(654321);
  });

  it('rejects a write whose observed position is older than the stored one', async () => {
    const { cookie } = await createUserAndLogin(env);
    const book = await uploadFixture(env, cookie);
    const fresh = { pctQ: 500_000, spine: 9, observedAt: 2_000 };
    const stale = { pctQ: 100_000, spine: 2, observedAt: 1_000 };

    await app.request(...jsonRequest(`/api/books/${book.id}/progress`, 'PUT', fresh, cookie), env);
    await app.request(...jsonRequest(`/api/books/${book.id}/progress`, 'PUT', stale, cookie), env);

    const res = await app.request(`/api/books/${book.id}/progress`, { headers: { cookie } }, env);
    const body = (await res.json()) as ProgressResponse;
    expect(body.local?.spine).toBe(9);
    expect(body.local?.pctQ).toBe(500_000);
  });

  it('accepts a newer observation and records the writing device', async () => {
    const { user, cookie } = await createUserAndLogin(env);
    const book = await uploadFixture(env, cookie);
    await app.request(...jsonRequest(`/api/books/${book.id}/progress`, 'PUT', { pctQ: 1_000, spine: 0, observedAt: 1_000 }, cookie), env);
    await app.request(...jsonRequest(`/api/books/${book.id}/progress`, 'PUT', { pctQ: 900_000, spine: 11, observedAt: 3_000 }, cookie), env);

    const res = await app.request(`/api/books/${book.id}/progress`, { headers: { cookie } }, env);
    const body = (await res.json()) as ProgressResponse;
    expect(body.local?.spine).toBe(11);
    expect(body.local?.deviceId).toBe(await firstDeviceId(env, user.id));
  });

  // Old clients send no observedAt at all; they must keep overwriting as before.
  it('lets a write without observedAt through', async () => {
    const { cookie } = await createUserAndLogin(env);
    const book = await uploadFixture(env, cookie);
    await app.request(...jsonRequest(`/api/books/${book.id}/progress`, 'PUT', { pctQ: 500_000, spine: 9 }, cookie), env);
    await app.request(...jsonRequest(`/api/books/${book.id}/progress`, 'PUT', { pctQ: 100_000, spine: 2 }, cookie), env);

    const res = await app.request(`/api/books/${book.id}/progress`, { headers: { cookie } }, env);
    const body = (await res.json()) as ProgressResponse;
    expect(body.local?.spine).toBe(2);
  });

  it('clamps an observedAt from a clock set into the future', async () => {
    const { cookie } = await createUserAndLogin(env);
    const book = await uploadFixture(env, cookie);
    const farFuture = Math.floor(Date.now() / 1000) + 86_400 * 365;
    await app.request(...jsonRequest(`/api/books/${book.id}/progress`, 'PUT', { pctQ: 1_000, spine: 0, observedAt: farFuture }, cookie), env);
    await app.request(...jsonRequest(`/api/books/${book.id}/progress`, 'PUT', { pctQ: 900_000, spine: 11, observedAt: Math.floor(Date.now() / 1000) }, cookie), env);

    const res = await app.request(`/api/books/${book.id}/progress`, { headers: { cookie } }, env);
    const body = (await res.json()) as ProgressResponse;
    expect(body.local?.spine).toBe(11);
  });
});
