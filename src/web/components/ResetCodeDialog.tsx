import { useT } from '../i18n/LocaleProvider';
import { Icon } from '../lib/icons';

interface ResetCodeDialogProps {
  open: boolean;
  code: string;
  onClose: () => void;
}

// The raw code exists only here - closing discards it, so a re-visit to this
// user's row can never show it again (the API itself never returns it twice).
export const ResetCodeDialog = ({ open, code, onClose }: ResetCodeDialogProps) => {
  const { t } = useT();
  if (!open) return null;

  const link = `${window.location.origin}/reset?code=${code}`;
  const onCopy = () => void navigator.clipboard.writeText(link);

  return (
    <>
      <button type="button" aria-label={t('common.close')} onClick={onClose} className="fixed inset-0 z-40 bg-[rgba(42,37,31,.28)]" />
      <div role="alertdialog" aria-modal="true" className="fixed left-1/2 top-1/2 z-50 flex w-[340px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 flex-col gap-[18px] rounded-xl border border-border bg-surface p-[22px_22px_18px] shadow-[0_18px_44px_rgba(42,37,31,.22)]">
        <h2 className="font-serif text-[16.5px] font-semibold text-ink">{t('admin.resetLink')}</h2>
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between gap-3 rounded-[6px] bg-accent-soft px-3.5 py-3 text-accent-ink">
            <span className="break-all font-mono text-[13px] tracking-[.02em]">{link}</span>
            <button type="button" aria-label={t('admin.copyLink')} onClick={onCopy}>
              <Icon name="copy" size={18} />
            </button>
          </div>
          <span className="text-[12.5px] text-faint">{t('admin.resetOnce')}</span>
        </div>
        <button type="button" onClick={onClose} className="flex h-[42px] items-center justify-center rounded-[6px] border border-control bg-surface text-[15px] font-semibold text-muted">
          {t('common.close')}
        </button>
      </div>
    </>
  );
};
