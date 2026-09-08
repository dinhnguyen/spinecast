import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminUserDto } from '../../shared/apiTypes';
import { LocaleProvider } from '../i18n/LocaleProvider';
import { AuthProvider } from '../lib/auth';
import { AdminUsers } from './AdminUsers';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

// jsdom does not implement matchMedia; stub it so useMediaQuery resolves to a
// chosen layout deterministically, as BookCard.test.tsx does (a fixed `matches`
// regardless of the query string, rather than pattern-matching the query text -
// which would silently always resolve the same way for the one query this page
// actually asks).
const stubMatchMedia = (matches: boolean) => {
  window.matchMedia = ((query: string) => ({
    matches,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
  })) as unknown as typeof window.matchMedia;
};

const me: AdminUserDto = { id: 'u1', email: 'admin@x', role: 'admin', createdAt: 0, disabledAt: null, bookCount: 1, bytesUsed: 100, passkeyCount: 0, lastSeenAt: 0 };
const u2: AdminUserDto = { id: 'u2', email: 'user2@x', role: 'user', createdAt: 0, disabledAt: null, bookCount: 2, bytesUsed: 200, passkeyCount: 0, lastSeenAt: 0 };
const u3: AdminUserDto = { id: 'u3', email: 'user3@x', role: 'user', createdAt: 0, disabledAt: 1, bookCount: 3, bytesUsed: 300, passkeyCount: 0, lastSeenAt: null };

const mockFetch = (extra: (url: string, init?: RequestInit) => Response | null) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = String(input);
    const res = extra(url, init);
    if (res) return Promise.resolve(res);
    if (url.includes('/api/auth/me')) return Promise.resolve(json(me));
    if (url === '/api/admin/users') return Promise.resolve(json({ items: [me, u2, u3] }));
    return Promise.resolve(json({ error: { code: 'not_found', message: 'nope' } }, 404));
  });

const mount = () =>
  render(
    <MemoryRouter>
      <LocaleProvider initial="vi">
        <AuthProvider>
          <AdminUsers />
        </AuthProvider>
      </LocaleProvider>
    </MemoryRouter>,
  );

describe('AdminUsers', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('links each email to the user detail page', async () => {
    stubMatchMedia(true);
    mockFetch(() => null);
    mount();
    await screen.findByText('user2@x');
    expect(screen.getByRole('link', { name: 'user2@x' }).getAttribute('href')).toBe('/admin/users/u2');
  });

  it('renders three rows, the disabled badge once, and hides actions for the caller only', async () => {
    stubMatchMedia(true);
    mockFetch(() => null);
    mount();

    await screen.findByText('admin@x');
    expect(screen.getByText('user2@x')).toBeTruthy();
    expect(screen.getByText('user3@x')).toBeTruthy();
    expect(screen.getAllByText('Đã khoá')).toHaveLength(1);

    expect(screen.queryByLabelText('Thao tác với admin@x')).toBeNull();
    expect(screen.getByLabelText('Thao tác với user2@x')).toBeTruthy();
    expect(screen.getByLabelText('Thao tác với user3@x')).toBeTruthy();
  });

  it('locks a user via the row menu', async () => {
    stubMatchMedia(true);
    const calls: unknown[] = [];
    mockFetch((url, init) => {
      if (url === '/api/admin/users/u2' && init?.method === 'PATCH') {
        calls.push(JSON.parse(String(init.body)));
        return json({ ...u2, disabledAt: 123 });
      }
      return null;
    });
    mount();

    await screen.findByText('user2@x');
    act(() => screen.getByLabelText('Thao tác với user2@x').click());
    await act(async () => screen.getByText('Khoá').click());

    await waitFor(() => expect(calls).toEqual([{ disabled: true }]));
  });

  it('issues a reset code and shows the reset link once', async () => {
    stubMatchMedia(true);
    mockFetch((url, init) => {
      if (url === '/api/admin/users/u2/reset-code' && init?.method === 'POST') {
        return json({ code: 'deadbeef00112233deadbeef00112233', expiresAt: 999 });
      }
      return null;
    });
    mount();

    await screen.findByText('user2@x');
    act(() => screen.getByLabelText('Thao tác với user2@x').click());
    await act(async () => screen.getByText('Cấp mã đặt lại').click());

    const link = await screen.findByText(/^http:\/\/localhost:3000\/reset\?code=/);
    expect(link.textContent).toBe('http://localhost:3000/reset?code=deadbeef00112233deadbeef00112233');
    expect(screen.getByText('Hết hạn sau 24 giờ, chỉ hiện một lần')).toBeTruthy();
  });

  it('surfaces a self_action error as an alert', async () => {
    stubMatchMedia(true);
    mockFetch((url, init) => {
      if (url === '/api/admin/users/u2' && init?.method === 'PATCH') {
        return json({ error: { code: 'self_action', message: 'nope' } }, 409);
      }
      return null;
    });
    mount();

    await screen.findByText('user2@x');
    act(() => screen.getByLabelText('Thao tác với user2@x').click());
    await act(async () => screen.getByText('Khoá').click());

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Không thể thực hiện thao tác này trên tài khoản của chính bạn'));
  });

  it('renders the mobile card layout and still hides the action button for the caller only', async () => {
    stubMatchMedia(false);
    mockFetch(() => null);
    mount();

    await screen.findByText('admin@x');
    expect(screen.getByText('user2@x')).toBeTruthy();
    expect(screen.getByText('user3@x')).toBeTruthy();
    // Mobile card copy line: "role · N sách · bytes" - proves the card branch
    // rendered, not the desktop table (whose cells are separate <td>s).
    expect(screen.getByText('Người dùng · 2 sách · 200 B')).toBeTruthy();
    expect(screen.getAllByText('Đã khoá')).toHaveLength(1);

    expect(screen.queryByLabelText('Thao tác với admin@x')).toBeNull();
    expect(screen.getByLabelText('Thao tác với user2@x')).toBeTruthy();
    expect(screen.getByLabelText('Thao tác với user3@x')).toBeTruthy();
  });
});
