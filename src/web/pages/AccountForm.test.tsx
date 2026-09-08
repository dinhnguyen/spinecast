import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n/LocaleProvider';
import { AuthProvider } from '../lib/auth';
import { AccountForm } from './AccountForm';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const me = { id: 'u1', email: 'admin@x', role: 'admin', locale: 'vi', deviceId: 'd' };
const mockFetch = (handler: (url: string, init?: RequestInit) => Response | null) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => handler(String(input), init) ?? json(me));
const mount = () => render(<MemoryRouter><LocaleProvider initial="vi"><AuthProvider><AccountForm /></AuthProvider></LocaleProvider></MemoryRouter>);

describe('AccountForm language control', () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('switches the UI and PATCHes the account', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    spy.mockResolvedValueOnce(json({ id: 'u', email: 'a@b.c', role: 'user', locale: 'vi' }));
    // refresh() also fires a timezone-report PATCH right after /me succeeds; it consumes its own response.
    spy.mockResolvedValueOnce(json({ id: 'u', email: 'a@b.c', role: 'user', locale: 'vi' }));
    spy.mockResolvedValueOnce(json({ id: 'u', email: 'a@b.c', role: 'user', locale: 'en' }));
    render(
      <MemoryRouter>
        <LocaleProvider initial="vi">
          <AuthProvider>
            <AccountForm />
          </AuthProvider>
        </LocaleProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Ngôn ngữ')).toBeTruthy());
    await act(async () => screen.getByRole('button', { name: 'English' }).click());
    expect(screen.getByText('Language')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Log out' })).toBeTruthy();
    expect((spy.mock.calls[2]![1] as RequestInit).method).toBe('PATCH');
  });

  it('blocks a mismatched repeat without calling the API', async () => {
    const spy = mockFetch(() => null);
    mount();
    await screen.findByDisplayValue('admin@x');
    fireEvent.change(screen.getByLabelText('Mật khẩu hiện tại'), { target: { value: 'old-pass-123' } });
    fireEvent.change(screen.getByLabelText('Mật khẩu mới'), { target: { value: 'new-pass-1234' } });
    fireEvent.change(screen.getByLabelText('Nhập lại mật khẩu mới'), { target: { value: 'new-pass-9999' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));
    expect(screen.getByRole('alert').textContent).toBe('Hai mật khẩu mới không khớp');
    expect(spy.mock.calls.some(([url]) => String(url).includes('/api/auth/password'))).toBe(false);
  });

  it('sends signOutOthers from the toggle and clears the fields on success', async () => {
    let body: unknown = null;
    mockFetch((url, init) => {
      if (url.includes('/api/auth/password')) {
        body = JSON.parse(String(init?.body));
        return json(me);
      }
      return null;
    });
    mount();
    await screen.findByDisplayValue('admin@x');
    fireEvent.click(screen.getByRole('switch', { name: 'Đăng xuất các thiết bị khác' }));
    fireEvent.change(screen.getByLabelText('Mật khẩu hiện tại'), { target: { value: 'old-pass-123' } });
    fireEvent.change(screen.getByLabelText('Mật khẩu mới'), { target: { value: 'new-pass-1234' } });
    fireEvent.change(screen.getByLabelText('Nhập lại mật khẩu mới'), { target: { value: 'new-pass-1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));
    await waitFor(() => expect(body).toEqual({ current: 'old-pass-123', password: 'new-pass-1234', signOutOthers: false }));
    await screen.findByText('Đã đổi mật khẩu');
    expect((screen.getByLabelText('Mật khẩu mới') as HTMLInputElement).value).toBe('');
  });

  it('shows invalid_credentials under the current-password field', async () => {
    mockFetch((url) => (url.includes('/api/auth/password') ? json({ error: { code: 'invalid_credentials', message: 'x' } }, 400) : null));
    mount();
    await screen.findByDisplayValue('admin@x');
    fireEvent.change(screen.getByLabelText('Mật khẩu hiện tại'), { target: { value: 'wrong' } });
    fireEvent.change(screen.getByLabelText('Mật khẩu mới'), { target: { value: 'new-pass-1234' } });
    fireEvent.change(screen.getByLabelText('Nhập lại mật khẩu mới'), { target: { value: 'new-pass-1234' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đổi mật khẩu' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Mật khẩu hiện tại không đúng'));
  });
});
