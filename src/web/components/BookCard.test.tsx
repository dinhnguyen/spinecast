import { act, cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookDto } from '../../shared/apiTypes';
import { LocaleProvider } from '../i18n/LocaleProvider';
import { BookCard } from './BookCard';

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

// jsdom does not implement matchMedia; stub it so useMediaQuery resolves to the
// mobile variant deterministically, without needing a real viewport or a
// long-press simulation.
const stubMatchMedia = (matches: boolean) => {
  window.matchMedia = ((query: string) => ({
    matches,
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
        <BookCard book={book} size="mobile" onDelete={() => {}} onToggleShared={() => {}} />
      </LocaleProvider>
    </MemoryRouter>,
  );

describe('BookCard keyboard-accessible options trigger (mobile variant)', () => {
  beforeEach(() => stubMatchMedia(true));
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('is reachable in the accessibility tree and opens the menu without a long-press', () => {
    mount();

    const triggers = screen.getAllByRole('button', { name: 'Tùy chọn sách' });
    const accessibleTrigger = triggers.find((el) => el.className.includes('sr-only'));
    expect(accessibleTrigger).toBeTruthy();

    // The bottom sheet isn't mounted yet - no long-press timer was ever started.
    expect(screen.queryByLabelText('Chia sẻ vào thư viện public')).toBeNull();

    act(() => accessibleTrigger!.click());

    expect(screen.getByLabelText('Chia sẻ vào thư viện public')).toBeTruthy();
  });
});

describe('BookCard select mode', () => {
  beforeEach(() => stubMatchMedia(false));
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows a checkbox that toggles selection instead of opening the book, and hides the options trigger', () => {
    const onToggleSelect = vi.fn();
    render(
      <MemoryRouter>
        <LocaleProvider initial="vi">
          <BookCard book={book} size="desktop" onDelete={() => {}} onToggleShared={() => {}} selectable selected={false} onToggleSelect={onToggleSelect} />
        </LocaleProvider>
      </MemoryRouter>,
    );

    expect(screen.queryByLabelText('Tùy chọn sách')).toBeNull();
    const checkbox = screen.getByLabelText('Chọn "Pride and Prejudice"');
    expect(checkbox.getAttribute('aria-pressed')).toBe('false');

    act(() => checkbox.click());
    expect(onToggleSelect).toHaveBeenCalledTimes(1);
  });
});

describe('BookCard list layout', () => {
  beforeEach(() => stubMatchMedia(false));
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('renders title and author in a row, with a small fixed-width cover', () => {
    render(
      <MemoryRouter>
        <LocaleProvider initial="vi">
          <BookCard book={book} size="desktop" onDelete={() => {}} onToggleShared={() => {}} layout="list" />
        </LocaleProvider>
      </MemoryRouter>,
    );

    // The no-cover placeholder also draws the title/author as cover art, so scope
    // to the actual title element rather than getByText (ambiguous with the cover).
    const title = document.querySelector('span.truncate.font-serif');
    expect(title?.textContent).toBe('Pride and Prejudice');
    const cover = document.querySelector('a[href="/read/b1"]');
    expect(cover?.className).toContain('w-14');
  });
});
