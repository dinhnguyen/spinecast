import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n/LocaleProvider';
import { AuthProvider, useAuth } from './auth';

// A fresh Response per call: refresh() reads /me and then fires a timezone PATCH,
// and a body can only be consumed once.
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
const me = { id: 'u', email: 'a@b.c', role: 'user', locale: 'vi', deviceId: 'dev-0123456789ab' };

const Probe = () => {
  const { user } = useAuth();
  return <span data-testid="user">{user?.email ?? ''}</span>;
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

const headerOf = (init: RequestInit | undefined): string | undefined => (init?.headers as Record<string, string> | undefined)?.['x-device-id'];

describe('device id', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('stores the device the server hands back', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(json(me)));
    mount();
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('a@b.c'));
    expect(localStorage.getItem('spinecast.deviceId')).toBe('dev-0123456789ab');
  });

  it('sends a stored device id and omits the header when there is none', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => Promise.resolve(json(me)));
    mount();
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('a@b.c'));
    expect(headerOf(spy.mock.calls[0]?.[1])).toBeUndefined();

    // This project has no global RTL cleanup, so the first tree has to go before
    // the second mount or every query matches twice.
    cleanup();
    spy.mockClear();
    mount();
    await waitFor(() => expect(spy.mock.calls.length).toBeGreaterThan(0));
    expect(headerOf(spy.mock.calls[0]?.[1])).toBe('dev-0123456789ab');
  });
});
