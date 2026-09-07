import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

describe('OpdsSettingsForm share link', () => {
  afterEach(() => vi.restoreAllMocks());

  it('shows a copy-share-link button only on the public card, once its token is revealed', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url.includes('/api/opds/tokens/public')) return Promise.resolve(json({ token: 'tok-xyz', createdAt: 100, lastUsedAt: null }));
      if (url.includes('/api/opds/tokens')) return Promise.resolve(json({ library: null, public: null, sharedCount: 0 }));
      return Promise.resolve(json({ id: 'u1', email: 'a@b.c', role: 'user', locale: 'vi' }));
    });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    mount();
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Tạo token' }).length).toBe(2));
    // library card first, public card second - matches the order OpdsSettingsForm renders them in.
    fireEvent.click(screen.getAllByRole('button', { name: 'Tạo token' })[1]!);

    const shareBtn = await screen.findByRole('button', { name: 'Sao chép link chia sẻ' });
    expect(screen.getAllByRole('button', { name: 'Sao chép link chia sẻ' }).length).toBe(1);
    fireEvent.click(shareBtn);
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/catalogs?url=${encodeURIComponent(`${window.location.origin}/opds/u1/public`)}&token=tok-xyz`);
  });
});
