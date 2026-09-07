import { describe, expect, it } from 'vitest';
import type { BookDto } from '../../shared/apiTypes';
import { loadSort, saveSort, sortBooks } from './bookSort';

const book = (id: string, over: Partial<BookDto>): BookDto => ({
  id,
  title: id,
  author: id,
  filename: `${id}.epub`,
  filesize: 1,
  hasCover: false,
  shared: false,
  hashPartial: id,
  hashFilename: id,
  createdAt: 0,
  lastOpenedAt: null,
  progress: null,
  ...over,
});

const ids = (books: BookDto[]): string[] => books.map((b) => b.id);

describe('bookSort', () => {
  it('falls back to recent when storage is empty or holds an unknown key', () => {
    localStorage.clear();
    expect(loadSort()).toBe('recent');
    localStorage.setItem('spinecast.librarySort', 'nope');
    expect(loadSort()).toBe('recent');
  });

  it('round-trips a saved key', () => {
    saveSort('author');
    expect(loadSort()).toBe('author');
  });

  it('puts never-opened books behind opened ones, newest first', () => {
    const books = [
      book('never', { createdAt: 30 }),
      book('old', { lastOpenedAt: 10 }),
      book('new', { lastOpenedAt: 20 }),
    ];
    expect(ids(sortBooks(books, 'recent', 'vi'))).toEqual(['new', 'old', 'never']);
  });

  it('sorts by title, by author then title, and by newest added', () => {
    const books = [
      book('b', { title: 'Ba', author: 'Zoe', createdAt: 3 }),
      book('a', { title: 'An', author: 'Zoe', createdAt: 1 }),
      book('c', { title: 'Ca', author: 'Ann', createdAt: 2 }),
    ];
    expect(ids(sortBooks(books, 'title', 'vi'))).toEqual(['a', 'b', 'c']);
    expect(ids(sortBooks(books, 'author', 'vi'))).toEqual(['c', 'a', 'b']);
    expect(ids(sortBooks(books, 'added', 'vi'))).toEqual(['b', 'c', 'a']);
  });

  it('leaves the input array untouched', () => {
    const books = [book('b', { title: 'Ba' }), book('a', { title: 'An' })];
    sortBooks(books, 'title', 'vi');
    expect(ids(books)).toEqual(['b', 'a']);
  });
});
