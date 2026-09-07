import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, useSearchParams } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n/LocaleProvider';
import { AuthProvider } from '../lib/auth';
import { CatalogsPage } from './CatalogsPage';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const CATALOG = { id: 'cat-a', name: 'Calibre nhà', url: 'https://books.test/opds', username: 'me', hasCredentials: true, createdAt: 100, lastOkAt: 200, lastError: null };

const mount = () =>
  render(
    <MemoryRouter>
      <LocaleProvider initial="vi">
        <AuthProvider>
          <CatalogsPage />
        </AuthProvider>
      </LocaleProvider>
    </MemoryRouter>,
  );

const routeFetch = (catalogs: unknown, status = 200) =>
  vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = String(input);
    if (url.includes('/api/opds/catalogs')) return Promise.resolve(json(catalogs, status));
    if (url.includes('/api/sync/settings')) return Promise.resolve(json({ enabled: false, serverUrl: '', username: '', hasCredentials: false, hashMethod: 'partial', lastOkAt: null, lastError: null }));
    return Promise.resolve(json({ id: 'u', email: 'a@b.c', role: 'user', locale: 'vi' }));
  });

describe('CatalogsPage', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('lists saved catalogs with the host and the last-call status', async () => {
    routeFetch({ items: [CATALOG] });
    mount();
    await waitFor(() => expect(screen.getByText('Calibre nhà')).toBeTruthy());
    expect(screen.getByText('books.test')).toBeTruthy();
    expect(screen.getByText(/Gọi được lần cuối/)).toBeTruthy();

    // Pins the row's sibling order (name link, then edit, then delete, then the
    // trailing chevron link) so a future edit cannot silently reorder them away
    // from what the OpdsCatalogs artboards draw.
    const nameLink = screen.getByText('Calibre nhà').closest('a');
    expect(nameLink).toBeTruthy();
    const editBtn = screen.getByRole('button', { name: 'Sửa' });
    const deleteBtn = screen.getByRole('button', { name: 'Xoá' });
    const chevronLink = nameLink!.parentElement!.lastElementChild;
    expect(chevronLink).toBeTruthy();
    expect(chevronLink).not.toBe(nameLink);
    const isBefore = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(isBefore(nameLink!, editBtn)).toBe(true);
    expect(isBefore(editBtn, deleteBtn)).toBe(true);
    expect(isBefore(deleteBtn, chevronLink!)).toBe(true);
  });

  it('shows a catalog error instead of the ok status', async () => {
    routeFetch({ items: [{ ...CATALOG, lastError: 'catalog_auth' }] });
    mount();
    await waitFor(() => expect(screen.getByText('Sai tên đăng nhập hoặc mật khẩu của nguồn')).toBeTruthy());
    expect(screen.queryByText(/Gọi được lần cuối/)).toBeNull();
  });

  it('shows the empty state when there are no catalogs', async () => {
    routeFetch({ items: [] });
    mount();
    await waitFor(() => expect(screen.getByText('Chưa có nguồn nào. Thêm URL catalog OPDS để duyệt và tải sách về.')).toBeTruthy());
  });

  it('shows the load error rather than the empty state', async () => {
    routeFetch({ error: { code: 'internal', message: 'boom' } }, 500);
    mount();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Lỗi máy chủ'));
    expect(screen.queryByText('Chưa có nguồn nào. Thêm URL catalog OPDS để duyệt và tải sách về.')).toBeNull();
  });

  it('opens the add form pre-filled from a share link, then clears the query string', async () => {
    routeFetch({ items: [] });
    const SearchProbe = () => {
      const [params] = useSearchParams();
      return <span data-testid="search">{params.toString()}</span>;
    };
    render(
      <MemoryRouter initialEntries={['/catalogs?url=https%3A%2F%2Fx.test%2Fopds&token=tok-123']}>
        <LocaleProvider initial="vi">
          <AuthProvider>
            <CatalogsPage />
            <SearchProbe />
          </AuthProvider>
        </LocaleProvider>
      </MemoryRouter>,
    );
    await waitFor(() => expect((screen.getByLabelText('URL catalog') as HTMLInputElement).value).toBe('https://x.test/opds'));
    expect((screen.getByLabelText(/Mật khẩu/) as HTMLInputElement).value).toBe('tok-123');
    expect(screen.getByTestId('search').textContent).toBe('');
  });
});
