import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LocaleProvider } from '../i18n/LocaleProvider';
import { DeleteUserDialog } from './DeleteUserDialog';

const mount = (onConfirm: () => void) =>
  render(
    <LocaleProvider initial="vi">
      <DeleteUserDialog open email="a@b.c" onConfirm={onConfirm} onCancel={() => {}} />
    </LocaleProvider>,
  );

describe('DeleteUserDialog', () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('keeps the confirm button disabled until the typed email matches exactly', () => {
    const onConfirm = vi.fn();
    mount(onConfirm);

    const confirmButton = screen.getByRole('button', { name: 'Xoá' }) as HTMLButtonElement;
    const input = screen.getByLabelText('Nhập đúng email để xác nhận');

    expect(confirmButton.disabled).toBe(true);

    fireEvent.change(input, { target: { value: 'A@b.c' } });
    expect(confirmButton.disabled).toBe(true);

    fireEvent.change(input, { target: { value: 'a@b.c' } });
    expect(confirmButton.disabled).toBe(false);

    fireEvent.click(confirmButton);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
