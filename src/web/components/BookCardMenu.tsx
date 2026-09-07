import { useEffect, useRef, useState } from 'react';
import type { BookDto } from '../../shared/apiTypes';
import { useT } from '../i18n/LocaleProvider';
import { Icon } from '../lib/icons';
import { BottomSheet } from './BottomSheet';
import { ConfirmDialog } from './ConfirmDialog';
import { Toggle } from './Toggle';

interface BookCardMenuProps {
  open: boolean;
  onClose: () => void;
  book: Pick<BookDto, 'title' | 'shared'>;
  variant: 'desktop' | 'mobile';
  onToggleShared: (shared: boolean) => void;
  onDelete: () => void;
}

export const BookCardMenu = ({ open, onClose, book, variant, onToggleShared, onDelete }: BookCardMenuProps) => {
  const { t } = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!open || confirming || variant !== 'desktop') return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open, confirming, variant, onClose]);

  if (!open) return null;

  const confirmDelete = () => {
    setConfirming(false);
    onDelete();
    onClose();
  };

  const dialog = <ConfirmDialog open={confirming} message={t('book.deleteConfirm', { title: book.title })} confirmLabel={t('book.delete')} onConfirm={confirmDelete} onCancel={() => setConfirming(false)} />;

  if (variant === 'mobile') {
    return (
      <>
      <BottomSheet open onClose={onClose} title={book.title} height={200}>
        <div className="flex h-12 items-center justify-between gap-3">
          <span className="text-[15px] font-medium">{t('book.share')}</span>
          <Toggle checked={book.shared} onChange={onToggleShared} label={t('book.share')} />
        </div>
        <button type="button" onClick={() => setConfirming(true)} className="flex h-12 items-center gap-2.5 text-[15px] font-medium text-danger">
          <Icon name="x" size={18} />
          <span>{t('book.delete')}</span>
        </button>
      </BottomSheet>
      {dialog}
      </>
    );
  }

  return (
    <>
    <div ref={ref} className="absolute right-2 top-11 z-20 flex w-[236px] flex-col rounded-lg border border-border bg-surface p-1.5 shadow-[0_8px_24px_rgba(42,37,31,.16)]">
      <div className="flex h-10 items-center justify-between gap-3 rounded-[6px] px-2.5">
        <span className="text-[14px] font-medium">{t('book.share')}</span>
        <Toggle checked={book.shared} onChange={onToggleShared} label={t('book.share')} />
      </div>
      <button type="button" onClick={() => setConfirming(true)} className="flex h-10 items-center gap-2.5 rounded-[6px] px-2.5 text-[14px] font-medium text-danger">
        <Icon name="x" size={16} />
        <span>{t('book.delete')}</span>
      </button>
    </div>
    {dialog}
    </>
  );
};
