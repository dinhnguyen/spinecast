import { useState } from 'react';
import { useT } from '../i18n/LocaleProvider';
import { ConfirmDialog } from './ConfirmDialog';

interface BulkActionBarProps {
  count: number;
  allSelected: boolean;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onShare: () => void;
  onUnshare: () => void;
  onDelete: () => void;
  onDone: () => void;
}

export const BulkActionBar = ({ count, allSelected, onSelectAll, onSelectNone, onShare, onUnshare, onDelete, onDone }: BulkActionBarProps) => {
  const { t, tn } = useT();
  const [confirming, setConfirming] = useState(false);

  const confirmDelete = () => {
    setConfirming(false);
    onDelete();
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface px-5 pb-[max(18px,env(safe-area-inset-bottom))] pt-3 md:px-10 md:py-3">
      <div className="flex items-center gap-3">
        <button type="button" onClick={allSelected ? onSelectNone : onSelectAll} className="text-[13.5px] font-medium text-accent-ink">
          {t(allSelected ? 'library.selectNone' : 'library.selectAll')}
        </button>
        <span className="text-[13.5px] text-muted">{t('library.selectedCount', { count })}</span>
      </div>
      <div className="flex items-center gap-4">
        <button type="button" onClick={onShare} disabled={count === 0} className="text-[13.5px] font-medium text-ink disabled:text-faint">
          {t('library.bulkShare')}
        </button>
        <button type="button" onClick={onUnshare} disabled={count === 0} className="text-[13.5px] font-medium text-ink disabled:text-faint">
          {t('library.bulkUnshare')}
        </button>
        <button type="button" onClick={() => setConfirming(true)} disabled={count === 0} className="text-[13.5px] font-medium text-danger disabled:text-faint">
          {t('library.bulkDelete')}
        </button>
        <button type="button" onClick={onDone} className="text-[13.5px] font-semibold text-accent-ink">
          {t('library.selectDone')}
        </button>
      </div>
      <ConfirmDialog open={confirming} message={tn('library.bulkDeleteConfirm', count)} confirmLabel={t('library.bulkDelete')} onConfirm={confirmDelete} onCancel={() => setConfirming(false)} />
    </div>
  );
};
