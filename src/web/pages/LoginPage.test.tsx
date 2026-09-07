import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n/LocaleProvider';
import { AuthProvider } from '../lib/auth';
import { LoginPage } from './LoginPage';

const supports = vi.fn(() => true);
const startAuth = vi.fn();
vi.mock('@simplewebauthn/browser', () => ({
  browserSupportsWebAuthn: () => supports(),
  startAuthentication: (args: unknown) => startAuth(args),
  startRegistration: () => Promise.reject(new Error('not used here')),
}));

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const ASSERTION = { id: 'cred-a', rawId: 'cred-a', type: 'public-key', clientExtensionResults: {}, response: {} };

const mount = () =>
  render(
    <MemoryRouter>
      <LocaleProvider initial="vi">
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </LocaleProvider>
    </MemoryRouter>,
  );

const routeFetch = (verify: Response) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = String(input);
    if (url.includes('/api/auth/passkey/options')) return Promise.resolve(json({ challengeId: 'c1', options: { challenge: 'abc', allowCredentials: [] } }));
    if (url.includes('/api/auth/passkey/verify')) return Promise.resolve(verify.clone());
    return Promise.resolve(json({ error: { code: 'unauthorized', message: 'no' } }, 401));
  });

const button = () => screen.getByRole('button', { name: 'Đăng nhập bằng passkey' });

describe('LoginPage passkey button', () => {
  beforeEach(() => {
    supports.mockReturnValue(true);
    startAuth.mockResolvedValue(ASSERTION);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('hides the button when the browser does not support WebAuthn', async () => {
    supports.mockReturnValue(false);
    routeFetch(json({}));
    mount();
    await waitFor(() => expect(screen.getByLabelText('Email')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Đăng nhập bằng passkey' })).toBeNull();
  });

  it('shows no alert when the user cancels the OS prompt', async () => {
    startAuth.mockRejectedValue(Object.assign(new Error('cancelled'), { name: 'NotAllowedError' }));
    routeFetch(json({}));
    mount();
    await waitFor(() => expect(button()).toBeTruthy());
    fireEvent.click(button());
    await waitFor(() => expect((button() as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows no alert when the cancel arrives wrapped as a cause', async () => {
    startAuth.mockRejectedValue(Object.assign(new Error('ceremony aborted'), { name: 'WebAuthnError', cause: { name: 'NotAllowedError' } }));
    routeFetch(json({}));
    mount();
    await waitFor(() => expect(button()).toBeTruthy());
    fireEvent.click(button());
    await waitFor(() => expect((button() as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows an alert when the server rejects the assertion', async () => {
    routeFetch(json({ error: { code: 'invalid_credentials', message: 'no' } }, 401));
    mount();
    await waitFor(() => expect(button()).toBeTruthy());
    fireEvent.click(button());
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Email hoặc mật khẩu không đúng'));
  });

  it('signs in and leaves the login screen on success', async () => {
    routeFetch(json({ id: 'u', email: 'a@b.c', role: 'user', locale: 'vi', deviceId: 'dev-1' }));
    mount();
    await waitFor(() => expect(button()).toBeTruthy());
    fireEvent.click(button());
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Đăng nhập bằng passkey' })).toBeNull());
  });
});
