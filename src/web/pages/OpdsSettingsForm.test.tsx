import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n/LocaleProvider';
import { AuthProvider } from '../lib/auth';
import { OpdsSettingsForm } from './OpdsSettingsForm';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const mount = () =>
  render(
    <MemoryRouter>
      <LocaleProvider initial="vi">
        <AuthProvider>
          <OpdsSettingsForm />
        </AuthProvider>
      </LocaleProvider>
    </MemoryRouter>,
  );

describe('OpdsSettingsForm load failure', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows the load error instead of the "no token yet" empty state', async () => {
    // /api/opds/tokens and /api/auth/me both fire on mount (independent effects,
    // no dependency between them), so route by URL rather than call order.
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url.includes('/api/opds/tokens')) return Promise.resolve(json({ error: { code: 'internal', message: 'boom' } }, 500));
      return Promise.resolve(json({ id: 'u', email: 'a@b.c', role: 'user', locale: 'vi' }));
    });
    mount();

    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Lỗi máy chủ'));
    expect(screen.queryByText('Chưa tạo token')).toBeNull();
  });
});
