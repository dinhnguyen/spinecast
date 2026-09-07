import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LocaleProvider, useLocale } from './LocaleProvider';
import { STORAGE_KEY } from './locale';

const Probe = () => {
  const { locale, setLocale, t, tn } = useLocale();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="title">{t('library.title')}</span>
      <span data-testid="plural">{tn('time.daysAgo', 1)}</span>
      <button type="button" onClick={() => setLocale('en')}>en</button>
    </div>
  );
};

describe('LocaleProvider', () => {
  afterEach(() => localStorage.clear());

  it('renders with the initial locale and switches', () => {
    render(<LocaleProvider initial="vi"><Probe /></LocaleProvider>);
    expect(screen.getByTestId('locale').textContent).toBe('vi');
    expect(screen.getByTestId('title').textContent).toBe('Thư viện');
    expect(document.documentElement.lang).toBe('vi');
    act(() => screen.getByText('en').click());
    expect(screen.getByTestId('title').textContent).toBe('Library');
    expect(screen.getByTestId('plural').textContent).toBe('1 day ago');
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('en');
  });
});
