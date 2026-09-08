import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UserDto } from '../../shared/apiTypes';
import { LocaleProvider } from '../i18n/LocaleProvider';
import { AuthProvider } from '../lib/auth';
import { UserMenu } from './UserMenu';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const me = (role: UserDto['role']): UserDto => ({ id: 'u', email: 'a@b.c', role, locale: 'vi' }) as UserDto;

const renderMenu = (role: UserDto['role']) => {
  const spy = vi.spyOn(globalThis, 'fetch');
  spy.mockResolvedValueOnce(json(me(role)));
  // refresh() also fires a timezone-report PATCH right after /me succeeds; it consumes its own response.
  spy.mockResolvedValueOnce(json(me(role)));
  return render(
    <MemoryRouter>
      <LocaleProvider initial="vi">
        <AuthProvider>
          <UserMenu open onClose={() => {}} variant="desktop" />
        </AuthProvider>
      </LocaleProvider>
    </MemoryRouter>,
  );
};

describe('UserMenu admin group', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows the admin nav rows for an admin', async () => {
    renderMenu('admin');
    await waitFor(() => expect(screen.getByRole('link', { name: 'Tổng quan' })).toBeTruthy());
    expect(screen.getByRole('link', { name: 'Người dùng' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Lời mời' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Đăng xuất' })).toBeTruthy();
  });

  it('hides the admin nav rows for a plain user', async () => {
    renderMenu('user');
    await waitFor(() => expect(screen.getByRole('button', { name: 'Đăng xuất' })).toBeTruthy());
    expect(screen.queryByRole('link', { name: 'Tổng quan' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Người dùng' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Lời mời' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Mã mời' })).toBeNull();
  });
});
