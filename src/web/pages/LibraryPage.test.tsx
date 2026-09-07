import { act, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookDto } from '../../shared/apiTypes';
import { LocaleProvider } from '../i18n/LocaleProvider';
import { AuthProvider } from '../lib/auth';
import { LibraryPage } from './LibraryPage';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const book: BookDto = {
  id: 'b1',
  title: 'Pride and Prejudice',
  author: 'Jane Austen',
  filename: 'pp.epub',
  filesize: 2048,
  hasCover: false,
  shared: false,
  hashPartial: 'h1',
  hashFilename: 'h2',
  createdAt: 0,
  lastOpenedAt: null,
  progress: null,
};

// jsdom does not implement matchMedia; stub it so useIsDesktop (LibraryPage) and
// useMediaQuery (BookCard) both resolve to the desktop layout deterministically.
const stubMatchMedia = () => {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('min-width'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
  })) as unknown as typeof window.matchMedia;
};

const mount = () =>
  render(
    <MemoryRouter>
      <LocaleProvider initial="vi">
        <AuthProvider>
          <LibraryPage />
        </AuthProvider>
      </LocaleProvider>
    </MemoryRouter>,
  );

describe('LibraryPage share toggle failure', () => {
  beforeEach(stubMatchMedia);
  afterEach(() => vi.restoreAllMocks());

  it('shows an error and leaves the badge off when the PATCH fails', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input);
      if (url.includes('/api/auth/me')) return Promise.resolve(json({ id: 'u1', email: 'a@b.c', role: 'user', locale: 'vi' }));
      if (url.includes('/api/books/b1') && init?.method === 'PATCH') return Promise.resolve(json({ error: { code: 'internal', message: 'boom' } }, 500));
      if (url.includes('/api/books')) return Promise.resolve(json({ items: [book] }));
      // /api/sync/settings: useSyncSettings swallows any failure, so a 404 is enough.
      return Promise.resolve(json({ error: { code: 'not_found', message: 'nope' } }, 404));
    });

    mount();

    await screen.findAllByText('Pride and Prejudice');
    // Two elements share this label: the visible desktop trigger and the sr-only
    // keyboard-accessible one (BookCard.test.tsx covers that one). jsdom applies no
    // real CSS, so both are "visible" to a label query here - pick the desktop one.
    const desktopTrigger = screen.getAllByLabelText('Tùy chọn sách').find((el) => !el.className.includes('sr-only'));
    act(() => desktopTrigger!.click());
    await act(async () => screen.getByLabelText('Chia sẻ vào thư viện public').click());

    await waitFor(() => expect(screen.getByText('Lỗi máy chủ')).toBeTruthy());
    expect(screen.queryByLabelText('Đã chia sẻ')).toBeNull();
  });
});
