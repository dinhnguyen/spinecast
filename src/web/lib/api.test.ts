import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiClientError, UNAUTHORIZED_EVENT } from './api';

describe('api client', () => {
  afterEach(() => vi.restoreAllMocks());

  it('returns parsed json on success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: 1 }), { status: 200, headers: { 'content-type': 'application/json' } }));
    expect(await api.get<{ ok: number }>('/api/x')).toEqual({ ok: 1 });
  });

  it('throws ApiClientError with the server code', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ error: { code: 'duplicate', message: 'dup', bookId: 'b1' } }), { status: 409, headers: { 'content-type': 'application/json' } }),
    );
    await expect(api.post('/api/x', {})).rejects.toMatchObject({ status: 409, code: 'duplicate', bookId: 'b1' } satisfies Partial<ApiClientError>);
  });

  it('announces a 401 outside the auth endpoints so the session can be re-checked', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      Promise.resolve(
        new Response(JSON.stringify({ error: { code: 'unauthorized', message: 'Chưa đăng nhập' } }), { status: 401, headers: { 'content-type': 'application/json' } }),
      ),
    );
    let fired = 0;
    const onUnauthorized = () => {
      fired += 1;
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    try {
      await expect(api.get('/api/books')).rejects.toBeInstanceOf(ApiClientError);
      expect(fired).toBe(1);
      // /api/auth/me answers 401 by design and is what the listener re-checks
      await expect(api.get('/api/auth/me')).rejects.toBeInstanceOf(ApiClientError);
      expect(fired).toBe(1);
    } finally {
      window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    }
  });

  it('sends credentials and json content type', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 204 }));
    await api.put('/api/y', { a: 1 });
    const init = spy.mock.calls[0]![1] as RequestInit;
    expect(init.credentials).toBe('same-origin');
    expect((init.headers as Record<string, string>)['content-type']).toBe('application/json');
  });

  it('sends PATCH with a json body', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } }));
    await api.patch('/api/z', { shared: true });
    const init = spy.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe('PATCH');
    expect(init.body).toBe(JSON.stringify({ shared: true }));
  });
});
