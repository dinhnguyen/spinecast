import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BookDto } from '../../shared/apiTypes';
import { useBooks } from './useBooks';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

const book = (overrides: Partial<BookDto> = {}): BookDto => ({
  id: 'b1',
  title: 'Truyện Kiều',
  author: 'Nguyễn Du',
  filename: 'kieu.epub',
  filesize: 1024,
  hasCover: false,
  shared: false,
  hashPartial: 'h1',
  hashFilename: 'h2',
  createdAt: 0,
  lastOpenedAt: null,
  progress: null,
  ...overrides,
});

describe('useBooks setShared', () => {
  afterEach(() => vi.restoreAllMocks());

  it('replaces the book with the server response on success', async () => {
    const initial = book({ shared: false });
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input);
      if (url.includes('/api/books/b1') && init?.method === 'PATCH') return Promise.resolve(json(book({ shared: true })));
      return Promise.resolve(json({ items: [initial] }));
    });

    const { result } = renderHook(() => useBooks());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.setShared('b1', true);

    await waitFor(() => expect(result.current.books[0]?.shared).toBe(true));
  });

  it('rejects and leaves the book list unchanged when the PATCH fails', async () => {
    const initial = book({ shared: false });
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input);
      if (url.includes('/api/books/b1') && init?.method === 'PATCH') {
        return Promise.resolve(json({ error: { code: 'internal', message: 'boom' } }, 500));
      }
      return Promise.resolve(json({ items: [initial] }));
    });

    const { result } = renderHook(() => useBooks());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await expect(result.current.setShared('b1', true)).rejects.toMatchObject({ code: 'internal' });

    // Nothing was optimistically flipped, so the failed PATCH leaves the original value.
    expect(result.current.books[0]?.shared).toBe(false);
  });
});

describe('useBooks bulkRemove', () => {
  afterEach(() => vi.restoreAllMocks());

  it('drops only the ids the server confirms deleted', async () => {
    const initial = [book({ id: 'b1' }), book({ id: 'b2' })];
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input);
      if (url.includes('/api/books/bulk-delete') && init?.method === 'POST') return Promise.resolve(json({ deleted: ['b1'] }));
      return Promise.resolve(json({ items: initial }));
    });

    const { result } = renderHook(() => useBooks());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.bulkRemove(['b1', 'b2']);

    await waitFor(() => expect(result.current.books.map((b) => b.id)).toEqual(['b2']));
  });
});

describe('useBooks bulkSetShared', () => {
  afterEach(() => vi.restoreAllMocks());

  it('replaces each returned book with the server response', async () => {
    const initial = [book({ id: 'b1', shared: false }), book({ id: 'b2', shared: false })];
    vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
      const url = String(input);
      if (url.includes('/api/books/bulk-share') && init?.method === 'PATCH') return Promise.resolve(json({ items: [book({ id: 'b1', shared: true })] }));
      return Promise.resolve(json({ items: initial }));
    });

    const { result } = renderHook(() => useBooks());
    await waitFor(() => expect(result.current.loading).toBe(false));

    await result.current.bulkSetShared(['b1'], true);

    await waitFor(() => expect(result.current.books.find((b) => b.id === 'b1')?.shared).toBe(true));
    expect(result.current.books.find((b) => b.id === 'b2')?.shared).toBe(false);
  });
});
