import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n/LocaleProvider';
import { LibraryViewToggle } from './LibraryViewToggle';

const mount = (value: 'grid' | 'list', onChange: (v: 'grid' | 'list') => void) =>
  render(
    <LocaleProvider initial="vi">
      <LibraryViewToggle value={value} onChange={onChange} />
    </LocaleProvider>,
  );

describe('LibraryViewToggle', () => {
  afterEach(() => vi.restoreAllMocks());

  it('marks the active mode pressed and calls onChange for the other one', () => {
    const onChange = vi.fn();
    mount('grid', onChange);

    const gridBtn = screen.getByLabelText('Dạng lưới');
    const listBtn = screen.getByLabelText('Dạng danh sách');
    expect(gridBtn.getAttribute('aria-pressed')).toBe('true');
    expect(listBtn.getAttribute('aria-pressed')).toBe('false');

    act(() => listBtn.click());
    expect(onChange).toHaveBeenCalledWith('list');
  });
});
