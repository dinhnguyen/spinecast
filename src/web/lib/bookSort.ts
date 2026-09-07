import type { BookDto, Locale } from '../../shared/apiTypes';
import type { MessageKey } from '../i18n/messages';

export type SortKey = 'recent' | 'title' | 'author' | 'added';

export const SORT_LABELS: Record<SortKey, MessageKey> = {
  recent: 'library.sortRecent',
  title: 'library.sortTitle',
  author: 'library.sortAuthor',
  added: 'library.sortAdded',
};

export const SORT_KEYS = Object.keys(SORT_LABELS) as SortKey[];

const KEY = 'spinecast.librarySort';

export const loadSort = (): SortKey => {
  try {
    const raw = localStorage.getItem(KEY);
    return SORT_KEYS.some((k) => k === raw) ? (raw as SortKey) : 'recent';
  } catch {
    return 'recent';
  }
};

export const saveSort = (key: SortKey): void => {
  try {
    localStorage.setItem(KEY, key);
  } catch {
    // storage may be unavailable; the choice then lives for the session only
  }
};

export const sortBooks = (books: BookDto[], key: SortKey, locale: Locale): BookDto[] => {
  const text = (a: string, b: string) => a.localeCompare(b, locale, { sensitivity: 'base' });
  const out = [...books];
  if (key === 'title') return out.sort((a, b) => text(a.title, b.title));
  if (key === 'author') return out.sort((a, b) => text(a.author, b.author) || text(a.title, b.title));
  if (key === 'added') return out.sort((a, b) => b.createdAt - a.createdAt);
  // Mirrors the server order: never-opened books fall behind the ones with a timestamp.
  return out.sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0) || b.createdAt - a.createdAt);
};
