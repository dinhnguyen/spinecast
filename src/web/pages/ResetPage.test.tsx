import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n/LocaleProvider';
import { AuthProvider } from '../lib/auth';
import { ResetPage } from './ResetPage';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const RootProbe = () => <span data-testid="root">root</span>;

const mount = (entry: string) =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <LocaleProvider initial="vi">
        <AuthProvider>
          <Routes>
            <Route path="/" element={<RootProbe />} />
            <Route path="/reset" element={<ResetPage />} />
          </Routes>
        </AuthProvider>
      </LocaleProvider>
    </MemoryRouter>,
  );

describe('ResetPage', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows an invalid-link message and no password field without a code', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ error: { code: 'unauthorized', message: 'no' } }, 401));
    mount('/reset');
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Link không hợp lệ, liên hệ quản trị viên.'));
    expect(screen.queryByLabelText(/[Mm]ật khẩu/)).toBeNull();
  });

  it('shows a password field and submit button with a code', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(json({ error: { code: 'unauthorized', message: 'no' } }, 401));
    mount('/reset?code=ABCD-EFGH');
    await waitFor(() => expect(screen.getByLabelText('Mật khẩu mới')).toBeTruthy());
    expect(screen.getByRole('button', { name: 'Đặt lại mật khẩu' })).toBeTruthy();
  });

  it('submits the code and password, and navigates to / on success', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ error: { code: 'unauthorized', message: 'no' } }, 401))
      .mockResolvedValueOnce(json({ id: 'u', email: 'a@b.c', role: 'user', locale: 'vi' }));
    mount('/reset?code=ABCD-EFGH');
    await waitFor(() => expect(screen.getByLabelText('Mật khẩu mới')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Mật khẩu mới'), { target: { value: 'newpassword1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đặt lại mật khẩu' }));
    await waitFor(() => expect(screen.getByTestId('root')).toBeTruthy());
    const [path, init] = spy.mock.calls[1]!;
    expect(path).toBe('/api/auth/reset');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ code: 'ABCD-EFGH', password: 'newpassword1' });
  });

  it('shows the expired-link message on a reset_expired 400', async () => {
    const spy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(json({ error: { code: 'unauthorized', message: 'no' } }, 401))
      .mockResolvedValueOnce(json({ error: { code: 'reset_expired', message: 'x' } }, 400));
    mount('/reset?code=ABCD-EFGH');
    await waitFor(() => expect(screen.getByLabelText('Mật khẩu mới')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Mật khẩu mới'), { target: { value: 'newpassword1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Đặt lại mật khẩu' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Link đã hết hạn, liên hệ quản trị viên để xin link mới.'));
    expect(spy).toHaveBeenCalledTimes(2);
  });
});
