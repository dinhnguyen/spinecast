import type { ReactNode } from 'react';
import { useT } from '../i18n/LocaleProvider';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  height: number;
  children: ReactNode;
}

export const BottomSheet = ({ open, onClose, title, height, children }: BottomSheetProps) => {
  const { t } = useT();
  if (!open) return null;
  return (
    <>
      <button type="button" aria-label={t('common.close')} onClick={onClose} className="fixed inset-0 z-40 bg-[rgba(42,37,31,.28)]" />
      <div style={{ height }} className="fixed inset-x-0 bottom-0 z-50 flex flex-col gap-3.5 rounded-t-2xl bg-surface px-5 pb-6 pt-2.5 shadow-[0_-8px_30px_rgba(42,37,31,.18)]">
        <span className="h-1 w-10 self-center rounded-[2px] bg-border" />
        {title ? <h2 className="font-serif text-[20px] font-semibold">{title}</h2> : null}
        {children}
      </div>
    </>
  );
};
