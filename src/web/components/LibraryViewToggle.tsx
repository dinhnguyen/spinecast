import { useT } from '../i18n/LocaleProvider';
import { Icon } from '../lib/icons';
import type { ViewMode } from '../lib/libraryView';

interface LibraryViewToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
}

export const LibraryViewToggle = ({ value, onChange }: LibraryViewToggleProps) => {
  const { t } = useT();

  const btn = (mode: ViewMode, label: string, icon: 'grid' | 'rows') => (
    <button
      type="button"
      aria-label={label}
      aria-pressed={value === mode}
      onClick={() => onChange(mode)}
      className={`flex h-[38px] w-[38px] items-center justify-center rounded-[5px] ${value === mode ? 'bg-accent-soft text-accent-ink' : 'text-muted'}`}
    >
      <Icon name={icon} size={16} />
    </button>
  );

  return (
    <div className="flex items-center gap-0.5 rounded-[6px] border border-border bg-surface p-0.5">
      {btn('grid', t('library.viewGrid'), 'grid')}
      {btn('list', t('library.viewList'), 'rows')}
    </div>
  );
};
