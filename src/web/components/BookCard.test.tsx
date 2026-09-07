import { act, render, screen } from '@testing-library/react';
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
  afterEach(() => vi.restoreAllMocks());

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
