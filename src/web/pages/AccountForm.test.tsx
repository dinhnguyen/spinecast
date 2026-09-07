import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n/LocaleProvider';
import { AuthProvider } from '../lib/auth';
import { AccountForm } from './AccountForm';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('AccountForm language control', () => {
  afterEach(() => {
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
});
