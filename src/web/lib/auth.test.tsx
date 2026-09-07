import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider, useLocale } from '../i18n/LocaleProvider';
import { STORAGE_KEY } from '../i18n/locale';
import { AuthProvider, RequireAuth, useAuth } from './auth';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const Probe = () => {
  const { locale } = useLocale();
  const { user, updateLocale } = useAuth();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="user">{user?.email ?? ''}</span>
      <button type="button" onClick={() => updateLocale('en').catch(() => undefined)}>en</button>
    </div>
  );
};

const mount = () =>
  render(
    <MemoryRouter>
      <LocaleProvider initial="vi">
        <AuthProvider>
          <Probe />
        </AuthProvider>
      </LocaleProvider>
    </MemoryRouter>,
  );

describe('AuthProvider locale sync', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('adopts the server locale after /me', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ id: 'u', email: 'a@b.c', role: 'user', locale: 'en' }));
    mount();
    // The locale-sync effect fires on a render pass after the `user` update commits, so
    // waiting on `user` alone can resolve before that cascade settles. Wait on both together.
    await waitFor(() => {
      expect(screen.getByTestId('user').textContent).toBe('a@b.c');
      expect(screen.getByTestId('locale').textContent).toBe('en');
    });
    expect(localStorage.getItem(STORAGE_KEY)).toBe('en');
  });

  it('updateLocale switches immediately and PATCHes', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    spy.mockResolvedValueOnce(json({ id: 'u', email: 'a@b.c', role: 'user', locale: 'vi' }));
    // refresh() also fires a timezone-report PATCH right after /me succeeds; it consumes its own response.
    spy.mockResolvedValueOnce(json({ id: 'u', email: 'a@b.c', role: 'user', locale: 'vi' }));
    spy.mockResolvedValueOnce(json({ id: 'u', email: 'a@b.c', role: 'user', locale: 'en' }));
    mount();
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('a@b.c'));
    await act(async () => screen.getByText('en').click());
    expect(screen.getByTestId('locale').textContent).toBe('en');
    const [path, init] = spy.mock.calls[2]!;
    expect(path).toBe('/api/auth/me');
    expect((init as RequestInit).method).toBe('PATCH');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ locale: 'en' });
  });

  it('keeps the local choice when PATCH fails', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    spy.mockResolvedValueOnce(json({ id: 'u', email: 'a@b.c', role: 'user', locale: 'vi' }));
    // refresh() also fires a timezone-report PATCH right after /me succeeds; it consumes its own response.
    spy.mockResolvedValueOnce(json({ id: 'u', email: 'a@b.c', role: 'user', locale: 'vi' }));
    spy.mockResolvedValueOnce(json({ error: { code: 'internal', message: 'x' } }, 500));
    mount();
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('a@b.c'));
    await act(async () => {
      screen.getByText('en').click();
    });
    expect(screen.getByTestId('locale').textContent).toBe('en');
  });
});

const FromProbe = () => {
  const location = useLocation();
  return <span data-testid="from">{(location.state as { from?: string } | null)?.from ?? ''}</span>;
};

const mountGuarded = (entry: string) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <LocaleProvider initial="vi">
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<FromProbe />} />
            <Route
              path="/catalogs"
              element={
                <RequireAuth>
                  <span>protected</span>
                </RequireAuth>
              }
            />
          </Routes>
        </AuthProvider>
      </LocaleProvider>
    </MemoryRouter>,
  );

describe('RequireAuth', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps the query string in the login redirect state', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ error: { code: 'unauthorized', message: 'no' } }, 401));
    mountGuarded('/catalogs?url=https%3A%2F%2Fx.test%2Fopds&token=abc');
    await waitFor(() => expect(screen.getByTestId('from').textContent).toBe('/catalogs?url=https%3A%2F%2Fx.test%2Fopds&token=abc'));
  });
});
