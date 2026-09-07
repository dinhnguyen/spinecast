import { act, cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n/LocaleProvider';
import { BulkActionBar } from './BulkActionBar';

const noop = () => {};

const mount = (overrides: Partial<Parameters<typeof BulkActionBar>[0]> = {}) =>
  render(
    <LocaleProvider initial="vi">
      <BulkActionBar count={2} allSelected={false} onSelectAll={noop} onSelectNone={noop} onShare={noop} onUnshare={noop} onDelete={noop} onDone={noop} {...overrides} />
    </LocaleProvider>,
  );

describe('BulkActionBar', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('shows the selected count and toggles select-all/none by current state', () => {
    const onSelectAll = vi.fn();
    mount({ onSelectAll });
    expect(screen.getByText('2 đã chọn')).toBeTruthy();
    act(() => screen.getByText('Chọn tất cả').click());
    expect(onSelectAll).toHaveBeenCalledTimes(1);
  });

  it('calls onShare and onUnshare directly, no confirmation needed', () => {
    const onShare = vi.fn();
    const onUnshare = vi.fn();
    mount({ onShare, onUnshare });
    act(() => screen.getByText('Chia sẻ').click());
    act(() => screen.getByText('Bỏ chia sẻ').click());
    expect(onShare).toHaveBeenCalledTimes(1);
    expect(onUnshare).toHaveBeenCalledTimes(1);
  });

  it('asks for confirmation before calling onDelete', () => {
    const onDelete = vi.fn();
    mount({ onDelete, count: 3 });
    act(() => screen.getByText('Xóa').click());
    expect(onDelete).not.toHaveBeenCalled();
    const dialog = screen.getByRole('alertdialog');
    expect(within(dialog).getByText('Xóa 3 cuốn sách đã chọn?')).toBeTruthy();
    act(() => within(dialog).getByText('Xóa').click());
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it('calls onDone when leaving select mode', () => {
    const onDone = vi.fn();
    mount({ onDone });
    act(() => screen.getByText('Xong').click());
    expect(onDone).toHaveBeenCalledTimes(1);
  });
});
