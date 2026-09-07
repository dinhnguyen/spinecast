import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
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

const book2: BookDto = { ...book, id: 'b2', title: 'Emma', author: 'Jane Austen' };

describe('LibraryPage share toggle failure', () => {
  beforeEach(stubMatchMedia);
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

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

const mockBooksFetch = (extra: (url: string, init?: RequestInit) => Response | null) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = String(input);
    const res = extra(url, init);
    if (res) return Promise.resolve(res);
    if (url.includes('/api/auth/me')) return Promise.resolve(json({ id: 'u1', email: 'a@b.c', role: 'user', locale: 'vi' }));
    if (url === '/api/books') return Promise.resolve(json({ items: [book, book2] }));
    return Promise.resolve(json({ error: { code: 'not_found', message: 'nope' } }, 404));
  });

describe('LibraryPage view toggle', () => {
  beforeEach(() => {
    stubMatchMedia();
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('switches to list layout and persists the choice', async () => {
    mockBooksFetch(() => null);
    mount();
    await screen.findAllByText('Pride and Prejudice');

    // The view toggle is rendered once per breakpoint header (mobile + desktop);
    // jsdom applies no real CSS, so both copies exist - either click flips the same state.
    expect(document.querySelector('.grid')).toBeTruthy();
    act(() => screen.getAllByLabelText('Dạng danh sách')[0]!.click());

    expect(document.querySelector('.grid')).toBeNull();
    expect(localStorage.getItem('spinecast.libraryView')).toBe('list');
  });
});

describe('LibraryPage select mode', () => {
  beforeEach(() => {
    stubMatchMedia();
    localStorage.clear();
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('selects books and bulk-shares them', async () => {
    const bulkShareCalls: unknown[] = [];
    mockBooksFetch((url, init) => {
      if (url === '/api/books/bulk-share' && init?.method === 'PATCH') {
        bulkShareCalls.push(JSON.parse(String(init.body)));
        return json({ items: [{ ...book, shared: true }] });
      }
      return null;
    });
    mount();
    await screen.findAllByText('Pride and Prejudice');

    // Same duplication as the view toggle: mobile + desktop headers both render it.
    act(() => screen.getAllByText('Chọn')[0]!.click());
    act(() => screen.getByLabelText('Chọn "Pride and Prejudice"').click());
    expect(screen.getByText('1 đã chọn')).toBeTruthy();

    await act(async () => screen.getByText('Chia sẻ').click());

    expect(bulkShareCalls).toEqual([{ ids: ['b1'], shared: true }]);
  });

  it('bulk-deletes the selected books and exits select mode', async () => {
    const deleteCalls: unknown[] = [];
    mockBooksFetch((url, init) => {
      if (url === '/api/books/bulk-delete' && init?.method === 'POST') {
        deleteCalls.push(JSON.parse(String(init.body)));
        return json({ deleted: ['b1'] });
      }
      return null;
    });
    mount();
    await screen.findAllByText('Pride and Prejudice');

    // Same duplication as the view toggle: mobile + desktop headers both render it.
    act(() => screen.getAllByText('Chọn')[0]!.click());
    act(() => screen.getByLabelText('Chọn "Pride and Prejudice"').click());
    act(() => screen.getByText('Xóa').click());
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText('Xóa 1 cuốn sách đã chọn?')).toBeTruthy();
    await act(async () => within(dialog).getByText('Xóa').click());

    expect(deleteCalls).toEqual([{ ids: ['b1'] }]);
    await waitFor(() => expect(screen.queryByText('Pride and Prejudice')).toBeNull());
    expect(screen.getAllByText('Chọn')[0]).toBeTruthy();
  });
});
