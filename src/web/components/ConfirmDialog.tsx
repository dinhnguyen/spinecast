import { useEffect, useRef } from 'react';
import { useT } from '../i18n/LocaleProvider';

interface ConfirmDialogProps {
  open: boolean;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

// Replaces window.confirm, which a browser may suppress after repeated dialogs
// and then answer `false` with nothing shown - indistinguishable from the user
// declining, so every destructive action silently did nothing.
export const ConfirmDialog = ({ open, message, confirmLabel, onConfirm, onCancel }: ConfirmDialogProps) => {
  const { t } = useT();
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;
  return (
    <>
      <button type="button" aria-label={t('common.cancel')} onClick={onCancel} className="fixed inset-0 z-40 bg-[rgba(42,37,31,.28)]" />
      <div role="alertdialog" aria-modal="true" className="fixed left-1/2 top-1/2 z-50 flex w-[340px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-[18px] rounded-xl border border-border bg-surface p-[22px_22px_18px] shadow-[0_18px_44px_rgba(42,37,31,.22)]">
        <p className="font-serif text-[16.5px] leading-[1.5] text-ink">{message}</p>
        <div className="flex gap-2.5">
          <button type="button" onClick={onCancel} className="flex h-[42px] flex-1 items-center justify-center rounded-[6px] border border-control bg-surface text-[15px] font-semibold text-muted">
            {t('common.cancel')}
          </button>
          <button ref={confirmRef} type="button" onClick={onConfirm} className="flex h-[42px] flex-1 items-center justify-center rounded-[6px] border border-danger bg-danger text-[15px] font-semibold text-on-accent">
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
};
