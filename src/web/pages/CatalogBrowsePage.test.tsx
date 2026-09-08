import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n/LocaleProvider';
import { AuthProvider } from '../lib/auth';
import { CatalogBrowsePage } from './CatalogBrowsePage';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const FEED = {
  title: 'Calibre Library',
  nav: [{ rel: 'subsection', href: '/opds/all', type: 'application/atom+xml', title: 'Tất cả sách', content: '482 cuốn' }],
  entries: [
    { id: 'urn:1', title: 'Dune', author: 'Frank Herbert', summary: '', acquisition: '/get/EPUB/1', coverHref: '/get/thumb/1', inLibrary: null },
    { id: 'urn:2', title: 'Đã tải rồi', author: '', summary: '', acquisition: '/get/EPUB/2', coverHref: null, inLibrary: 'bk-9' },
  ],
  next: '/opds/all?page=2',
  searchTemplate: '/opds/search?query={searchTerms}',
};

const FEED_PAGE_2 = {
  title: 'Calibre Library',
  nav: [],
  entries: [{ id: 'urn:3', title: 'Silmarillion', author: 'J.R.R. Tolkien', summary: '', acquisition: '/get/EPUB/3', coverHref: null, inLibrary: null }],
  next: null,
  searchTemplate: null,
};

const isBefore = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

const mount = () =>
  render(
    <MemoryRouter initialEntries={['/catalogs/cat-a']}>
      <LocaleProvider initial="vi">
        <AuthProvider>
          <Routes>
            <Route path="/catalogs/:id" element={<CatalogBrowsePage />} />
          </Routes>
        </AuthProvider>
      </LocaleProvider>
    </MemoryRouter>,
  );

describe('CatalogBrowsePage', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders navigation rows, book rows and the two row states', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url.includes('/browse')) return Promise.resolve(json(FEED));
      return Promise.resolve(json({ id: 'u', email: 'a@b.c', role: 'user', locale: 'vi' }));
    });
    mount();
    await waitFor(() => expect(screen.getByText('Dune')).toBeTruthy());
    expect(screen.getByText('Tất cả sách')).toBeTruthy();
    expect(screen.getByText('Đã có')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: 'Thêm' })).toHaveLength(1);
    expect(screen.getByPlaceholderText('Tìm trong nguồn')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tải thêm' })).toBeTruthy();
  });

  it('imports a book and flips the row to "Đã có"', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input);
      if (url.includes('/import')) return Promise.resolve(json({ id: 'bk-new', title: 'Dune' }, 201));
      if (url.includes('/browse')) return Promise.resolve(json(FEED));
      void init;
      return Promise.resolve(json({ id: 'u', email: 'a@b.c', role: 'user', locale: 'vi' }));
    });
    mount();
    await waitFor(() => expect(screen.getByText('Dune')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Thêm' }));
    await waitFor(() => expect(screen.getAllByText('Đã có')).toHaveLength(2));
  });

  it('shows a browse failure as an alert', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url.includes('/browse')) return Promise.resolve(json({ error: { code: 'catalog_auth', message: 'no' } }, 401));
      return Promise.resolve(json({ id: 'u', email: 'a@b.c', role: 'user', locale: 'vi' }));
    });
    mount();
    await waitFor(() => expect(screen.getByRole('alert').textContent).toBe('Sai tên đăng nhập hoặc mật khẩu của nguồn'));
  });

  it('flips the row to "Đã có" on a duplicate-import response instead of erroring', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input);
      if (url.includes('/import')) return Promise.resolve(json({ error: { code: 'duplicate', message: 'already in library', bookId: 'bk-9' } }, 409));
      if (url.includes('/browse')) return Promise.resolve(json(FEED));
      void init;
      return Promise.resolve(json({ id: 'u', email: 'a@b.c', role: 'user', locale: 'vi' }));
    });
    mount();
    await waitFor(() => expect(screen.getByText('Dune')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Thêm' }));
    await waitFor(() => expect(screen.getAllByText('Đã có')).toHaveLength(2));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does not load the next page twice when "Tải thêm" is clicked twice before it resolves', async () => {
    let nextPageCalls = 0;
    let resolveNextPage!: (r: Response) => void;
    const nextPage = new Promise<Response>((resolve) => {
      resolveNextPage = resolve;
    });
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url.includes('/browse?href=')) {
        nextPageCalls += 1;
        return nextPage;
      }
      if (url.includes('/browse')) return Promise.resolve(json(FEED));
      return Promise.resolve(json({ id: 'u', email: 'a@b.c', role: 'user', locale: 'vi' }));
    });
    mount();
    await waitFor(() => expect(screen.getByText('Dune')).toBeTruthy());
    const loadMoreBtn = screen.getByRole('button', { name: 'Tải thêm' });
    fireEvent.click(loadMoreBtn);
    fireEvent.click(loadMoreBtn);
    resolveNextPage(json(FEED_PAGE_2));
    await waitFor(() => expect(screen.getByText('Silmarillion')).toBeTruthy());
    expect(nextPageCalls).toBe(1);
    expect(screen.getAllByText('Silmarillion')).toHaveLength(1);
  });

  it('keeps the first page nav row and search box after loading a second page that has neither', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url.includes('/browse?href=')) return Promise.resolve(json(FEED_PAGE_2));
      if (url.includes('/browse')) return Promise.resolve(json(FEED));
      return Promise.resolve(json({ id: 'u', email: 'a@b.c', role: 'user', locale: 'vi' }));
    });
    mount();
    await waitFor(() => expect(screen.getByText('Dune')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Tải thêm' }));
    await waitFor(() => expect(screen.getByText('Silmarillion')).toBeTruthy());
    expect(screen.getByText('Tất cả sách')).toBeTruthy();
    expect(screen.getByPlaceholderText('Tìm trong nguồn')).toBeTruthy();
  });

  it('keeps the artboards\' child order for a nav row and a book row', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input);
      if (url.includes('/browse')) return Promise.resolve(json(FEED));
      return Promise.resolve(json({ id: 'u', email: 'a@b.c', role: 'user', locale: 'vi' }));
    });
    mount();
    await waitFor(() => expect(screen.getByText('Dune')).toBeTruthy());

    const navTitleBlock = screen.getByText('Tất cả sách').parentElement!;
    const navButton = navTitleBlock.parentElement!;
    const navChevron = navButton.lastElementChild!;
    expect(navChevron).not.toBe(navTitleBlock);
    expect(isBefore(navTitleBlock, navChevron)).toBe(true);

    const bookTitle = screen.getByText('Dune');
    const textColumn = bookTitle.parentElement!;
    const bookRow = textColumn.parentElement!;
    const thumb = bookRow.firstElementChild!;
    const action = screen.getByRole('button', { name: 'Thêm' });
    expect(thumb).not.toBe(textColumn);
    expect(isBefore(thumb, textColumn)).toBe(true);
    expect(isBefore(textColumn, action)).toBe(true);
  });
});
