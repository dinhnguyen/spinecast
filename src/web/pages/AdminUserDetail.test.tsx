import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminUserDetailDto } from '../../shared/apiTypes';
import { LocaleProvider } from '../i18n/LocaleProvider';
import { AuthProvider } from '../lib/auth';
import { AdminUserDetail } from './AdminUserDetail';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const me = { id: 'u1', email: 'admin@x', role: 'admin', locale: 'vi', deviceId: 'd-me' };
const detail: AdminUserDetailDto = {
  id: 'u2', email: 'user2@x', role: 'user', createdAt: 1_700_000_000, disabledAt: null, bookCount: 2, bytesUsed: 2048, passkeyCount: 1, lastSeenAt: 1_700_000_000,
  devices: [{ id: 'd1', name: 'Chrome', createdAt: 1, lastSeenAt: 1_700_000_000, current: false }],
  passkeys: [{ id: 'p1', name: 'MacBook', createdAt: 1, lastUsedAt: null }],
};

const mount = (value: AdminUserDetailDto | null = detail, calls: string[] = []) => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = String(input);
    if (url.includes('/api/auth/me')) return json(me);
    if (url === '/api/admin/users/u2' && (!init?.method || init.method === 'GET')) return value ? json(value) : json({ error: { code: 'not_found', message: 'no' } }, 404);
    if (init?.method === 'DELETE') { calls.push(url); return new Response(null, { status: 204 }); }
    return json(me);
  });
  return render(<MemoryRouter initialEntries={['/admin/users/u2']}><LocaleProvider initial="vi"><AuthProvider><Routes><Route path="/admin/users/:id" element={<AdminUserDetail />} /></Routes></AuthProvider></LocaleProvider></MemoryRouter>);
};

describe('AdminUserDetail', () => {
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it('renders the user, device and passkey', async () => {
    mount();
    expect(await screen.findByRole('heading', { name: 'user2@x' })).toBeTruthy();
    expect(screen.getByText('Chrome')).toBeTruthy();
    expect(screen.getByText('MacBook')).toBeTruthy();
  });

  it('renders empty device and passkey states', async () => {
    mount({ ...detail, devices: [], passkeys: [] });
    expect(await screen.findByText('Chưa có thiết bị')).toBeTruthy();
    expect(screen.getByText('Chưa có passkey')).toBeTruthy();
  });

  it('revokes a device after confirmation', async () => {
    const calls: string[] = [];
    mount(detail, calls);
    fireEvent.click(await screen.findByLabelText('Thu hồi Chrome'));
    expect(screen.getByRole('alertdialog').textContent).toContain('Thu hồi thiết bị "Chrome"?');
    fireEvent.click(screen.getByRole('button', { name: 'Xoá' }));
    await waitFor(() => expect(calls).toContain('/api/admin/users/u2/devices/d1'));
    await waitFor(() => expect(screen.queryByText('Chrome')).toBeNull());
    expect(screen.getByText('Đã thu hồi')).toBeTruthy();
  });

  it('warns when revoking the current device', async () => {
    mount({ ...detail, devices: [{ ...detail.devices[0]!, id: 'd-me' }] });
    fireEvent.click(await screen.findByLabelText('Thu hồi Chrome'));
    expect(screen.getByRole('alertdialog').textContent).toContain('Đây là thiết bị bạn đang dùng');
  });

  it('removes a passkey after confirmation', async () => {
    const calls: string[] = [];
    mount(detail, calls);
    fireEvent.click(await screen.findByLabelText('Gỡ passkey MacBook'));
    fireEvent.click(screen.getByRole('button', { name: 'Xoá' }));
    await waitFor(() => expect(calls).toContain('/api/admin/users/u2/passkeys/p1'));
  });

  it('surfaces a failing device revocation as an alert', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) return json(me);
      if (url === '/api/admin/users/u2' && (!init?.method || init.method === 'GET')) return json(detail);
      if (init?.method === 'DELETE') return json({ error: { code: 'internal', message: 'boom' } }, 500);
      return json(me);
    });
    render(<MemoryRouter initialEntries={['/admin/users/u2']}><LocaleProvider initial="vi"><AuthProvider><Routes><Route path="/admin/users/:id" element={<AdminUserDetail />} /></Routes></AuthProvider></LocaleProvider></MemoryRouter>);
    fireEvent.click(await screen.findByLabelText('Thu hồi Chrome'));
    fireEvent.click(screen.getByRole('button', { name: 'Xoá' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(screen.getByText('Chrome')).toBeTruthy();
  });

  it('shows the not-found state with a back link', async () => {
    mount(null);
    expect(await screen.findByText('Không tìm thấy người dùng này')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Danh sách người dùng' }).getAttribute('href')).toBe('/admin/users');
  });
});
