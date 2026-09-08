import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n/LocaleProvider';
import { Field } from './Field';

interface DeleteUserDialogProps {
  open: boolean;
  email: string;
  onConfirm: () => void;
  onCancel: () => void;
}

// ConfirmDialog has no body slot and every other caller wants none, so the
// typed-email gate lives in its own dialog rather than growing that one.
export const DeleteUserDialog = ({ open, email, onConfirm, onCancel }: DeleteUserDialogProps) => {
  const { t } = useT();
  const [value, setValue] = useState('');

  useEffect(() => {
    if (open) setValue('');
  }, [open]);

  const confirmRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;
  const disabled = value !== email;

  return (
    <>
      <button type="button" aria-label={t('common.cancel')} onClick={onCancel} className="fixed inset-0 z-40 bg-[rgba(42,37,31,.28)]" />
      <div role="alertdialog" aria-modal="true" className="fixed left-1/2 top-1/2 z-50 flex w-[340px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-[18px] rounded-xl border border-border bg-surface p-[22px_22px_18px] shadow-[0_18px_44px_rgba(42,37,31,.22)]">
        <p className="font-serif text-[16.5px] leading-[1.5] text-ink">{t('admin.deleteConfirm', { email })}</p>
        <Field label={t('admin.confirmEmail')} value={value} onChange={(e) => setValue(e.target.value)} />
        <div className="flex gap-2.5">
          <button type="button" onClick={onCancel} className="flex h-[42px] flex-1 items-center justify-center rounded-[6px] border border-control bg-surface text-[15px] font-semibold text-muted">
            {t('common.cancel')}
          </button>
          <button
            ref={confirmRef}
            type="button"
            disabled={disabled}
            onClick={onConfirm}
            className="flex h-[42px] flex-1 items-center justify-center rounded-[6px] border border-danger bg-danger text-[15px] font-semibold text-on-accent disabled:opacity-60"
          >
            {t('admin.delete')}
          </button>
        </div>
      </div>
    </>
  );
};
