import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n/LocaleProvider';
import { AuthProvider } from '../lib/auth';
import { PasskeysForm } from './PasskeysForm';

// jsdom has no WebAuthn, so support is controlled here. vi.mock rather than
// vi.spyOn: an ES module namespace is not writable.
const supports = vi.fn(() => true);
vi.mock('@simplewebauthn/browser', () => ({
  browserSupportsWebAuthn: () => supports(),
  startRegistration: () => Promise.reject(new Error('not reached in these tests')),
  startAuthentication: () => Promise.reject(new Error('not used here')),
}));

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const PASSKEY = { id: 'cred-a', name: 'MacBook', createdAt: 1_756_000_000, lastUsedAt: null };

const mount = () =>
  render(
    <MemoryRouter>
      <LocaleProvider initial="vi">
        <AuthProvider>
          <PasskeysForm />
        </AuthProvider>
      </LocaleProvider>
    </MemoryRouter>,
  );

const routeFetch = (passkeys: unknown, status = 200) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = String(input);
    if (url.includes('/api/passkeys')) return Promise.resolve(json(passkeys, status));
    return Promise.resolve(json({ id: 'u', email: 'a@b.c', role: 'user', locale: 'vi' }));
  });

describe('PasskeysForm', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('lists a passkey with its creation date and the never-used state', async () => {
    routeFetch({ items: [PASSKEY] });
    mount();
    await waitFor(() => expect(screen.getByText('MacBook')).toBeTruthy());
    expect(screen.getByText('Chưa dùng lần nào')).toBeTruthy();
  });

  it('shows the empty state when there are none', async () => {
    routeFetch({ items: [] });
    mount();
    await waitFor(() => expect(screen.getByText('Chưa có passkey nào.')).toBeTruthy());
  });

  it('shows the load error rather than the empty state', async () => {
    routeFetch({ error: { code: 'internal', message: 'boom' } }, 500);
    mount();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Lỗi máy chủ'));
    expect(screen.queryByText('Chưa có passkey nào.')).toBeNull();
  });

  it('reports a wrong step-up password on the form', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url.includes('/api/passkeys/register/options')) return Promise.resolve(json({ error: { code: 'invalid_credentials', message: 'no' } }, 401));
      if (url.includes('/api/passkeys')) return Promise.resolve(json({ items: [] }));
      return Promise.resolve(json({ id: 'u', email: 'a@b.c', role: 'user', locale: 'vi' }));
    });
    mount();
    await waitFor(() => expect(screen.getByRole('button', { name: 'Thêm passkey' })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Thêm passkey' }));
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'wrong-pass-9' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Email hoặc mật khẩu không đúng'));
  });
});
