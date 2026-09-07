import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n/LocaleProvider';
import { SORT_KEYS, SORT_LABELS, type SortKey } from '../lib/bookSort';
import { Icon } from '../lib/icons';
import { BottomSheet } from './BottomSheet';

interface LibrarySortProps {
  value: SortKey;
  onChange: (key: SortKey) => void;
  variant: 'desktop' | 'mobile';
}

export const LibrarySort = ({ value, onChange, variant }: LibrarySortProps) => {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || variant !== 'desktop') return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open, variant]);

  const pick = (key: SortKey) => {
    onChange(key);
    setOpen(false);
  };

  const trigger = (className: string) => (
    <button type="button" aria-label={t('library.sortLabel')} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)} className={className}>
      <span>{t(SORT_LABELS[value])}</span>
      <Icon name="chev" size={14} />
    </button>
  );

  if (variant === 'mobile') {
    return (
      <>
        {trigger('flex items-center gap-1 text-[13.5px] text-muted')}
        <BottomSheet open={open} onClose={() => setOpen(false)} title={t('library.sortLabel')} height={SORT_KEYS.length * 48 + 104}>
          <div className="flex flex-col">
            {SORT_KEYS.map((key) => (
              <button key={key} type="button" onClick={() => pick(key)} className={`flex h-12 items-center justify-between border-b border-border text-[15px] ${key === value ? 'font-semibold text-accent-ink' : 'text-ink'}`}>
                <span>{t(SORT_LABELS[key])}</span>
                {key === value ? <Icon name="check" size={18} className="text-accent" /> : null}
              </button>
            ))}
          </div>
        </BottomSheet>
      </>
    );
  }

  return (
    <div ref={ref} className="relative">
      {trigger('flex h-[38px] items-center gap-1.5 rounded-[6px] border border-border bg-surface px-3 text-[14px] text-muted')}
      {open ? (
        <div role="listbox" className="absolute right-0 top-11 z-20 flex w-[200px] flex-col rounded-lg border border-border bg-surface p-1.5 shadow-[0_8px_24px_rgba(42,37,31,.16)]">
          {SORT_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              role="option"
              aria-selected={key === value}
              onClick={() => pick(key)}
              className={`flex h-9 items-center justify-between rounded-[6px] px-2.5 text-[14px] ${key === value ? 'bg-accent-soft font-semibold text-accent-ink' : 'font-medium text-ink'}`}
            >
              <span>{t(SORT_LABELS[key])}</span>
              {key === value ? <Icon name="check" size={16} /> : null}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
};
