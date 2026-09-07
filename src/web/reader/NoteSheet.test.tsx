import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ClippingDto } from '../../shared/apiTypes';
import { NoteSheet } from './NoteSheet';
import { LocaleProvider } from '../i18n/LocaleProvider';

afterEach(cleanup);

const clipping: ClippingDto = {
  id: 'c1', spine: 0, para: 1, chapter: null, text: 'A passage',
  note: null, color: '#eddc9a', cfi: null, createdAt: 1, updatedAt: 1,
};

const show = () => {
  const onDelete = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(
    <LocaleProvider>
      <NoteSheet open clipping={clipping} onClose={onClose} onSave={vi.fn()} onDelete={onDelete} />
    </LocaleProvider>,
  );
  // Both the mobile sheet and the desktop panel render; either button is the same control.
  return { onDelete, onClose, deleteButton: screen.getAllByRole('button', { name: 'Delete highlight' })[0]! };
};

describe('NoteSheet delete', () => {
  it('does not delete on the first press, and asks instead', () => {
    const { onDelete, deleteButton } = show();
    fireEvent.click(deleteButton);
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    expect(screen.getByText('Delete this highlight and its note?')).toBeTruthy();
  });

  it('deletes exactly once after the dialog is confirmed', async () => {
    const { onDelete, deleteButton } = show();
    fireEvent.click(deleteButton);
    const confirm = screen.getAllByRole('button', { name: 'Delete highlight' }).at(-1)!;
    fireEvent.click(confirm);
    await vi.waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
  });

  it('deletes nothing when the dialog is cancelled', () => {
    const { onDelete, deleteButton } = show();
    fireEvent.click(deleteButton);
    fireEvent.click(screen.getAllByRole('button', { name: 'Cancel' })[0]!);
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
