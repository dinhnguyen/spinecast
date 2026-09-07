import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { app } from './app';

describe('app', () => {
  it('answers health', async () => {
    const res = await app.request('/api/health', {}, env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });

  it('returns the error shape for unknown api routes', async () => {
    const res = await app.request('/api/nope', {}, env);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: 'not_found', message: 'Not found' } });
  });
});
