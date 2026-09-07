import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from './ConfirmDialog';
import { LocaleProvider } from '../i18n/LocaleProvider';

afterEach(cleanup);

const show = (props: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) => {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  render(
    <LocaleProvider>
      <ConfirmDialog open message="Remove this device?" confirmLabel="Remove" onConfirm={onConfirm} onCancel={onCancel} {...props} />
    </LocaleProvider>,
  );
  return { onConfirm, onCancel };
};

describe('ConfirmDialog', () => {
  it('renders nothing when closed', () => {
    show({ open: false });
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('shows the message and the action-named confirm button', () => {
    show();
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(screen.getByText('Remove this device?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeTruthy();
  });

  it('calls onConfirm only when the confirm button is pressed', () => {
    const { onConfirm, onCancel } = show();
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('cancels on the cancel button', () => {
    const { onConfirm, onCancel } = show();
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel' })[0]!);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('cancels on Escape', () => {
    const { onConfirm, onCancel } = show();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('does not listen for Escape while closed', () => {
    const { onCancel } = show({ open: false });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('focuses the confirm button so Enter resolves the question', () => {
    show();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Remove' }));
  });
});
