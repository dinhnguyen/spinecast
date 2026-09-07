import type { CSSProperties } from 'react';
import type { SyncState } from '../components/SyncBadge';
import { SyncBadge } from '../components/SyncBadge';
import { useT } from '../i18n/LocaleProvider';
import { formatPercent } from '../lib/format';
import { Icon } from '../lib/icons';

const SYNC_ICON: Record<Exclude<SyncState, 'off'>, 'check' | 'sync' | 'alert'> = { ok: 'check', warn: 'sync', danger: 'alert' };
const SYNC_COLOR: Record<Exclude<SyncState, 'off'>, string> = { ok: 'text-ok', warn: 'text-warn', danger: 'text-danger' };

const ACTIONS = [
  { icon: 'list', label: 'reader.toc', key: 'toc' },
  { icon: 'type', label: 'reader.display', key: 'display' },
  { icon: 'bookmark', label: 'reader.bookmark', key: 'bookmark' },
  { icon: 'highlight', label: 'reader.notes', key: 'highlight' },
  { icon: 'search', label: 'reader.search', key: 'search' },
] as const;

interface ReaderToolbarProps {
  visible: boolean;
  themeBg: string;
  title: string;
  author: string;
  syncState: SyncState;
  syncText: string;
  chapterLabel: string;
  pctQ: number;
  tocOpen: boolean;
  notesOpen: boolean;
  displayOpen: boolean;
  bookmarked: boolean;
  onBack: () => void;
  onOpenToc: () => void;
  onOpenDisplay: () => void;
  onToggleBookmark: () => void;
  onSeek: (fraction: number) => void;
}

// The <input> itself is only the 44px touch target (per ReaderMobile.dc.html's
// hit areas elsewhere in this bar); the visible 3px track with its accent fill
// is painted on the track pseudo-elements, not the input's own box, so it
// doesn't inherit the input's full height. The fill percentage is expressed as
// a CSS custom property (inherited by pseudo-elements of the same element) so
// the same gradient can be shared between the -webkit and -moz track rules.
const rangeClass =
  'h-11 w-full flex-1 cursor-pointer appearance-none bg-transparent ' +
  '[&::-webkit-slider-runnable-track]:h-[3px] [&::-webkit-slider-runnable-track]:rounded-[2px] [&::-webkit-slider-runnable-track]:[background:var(--track-bg)] ' +
  '[&::-webkit-slider-thumb]:mt-[-6px] [&::-webkit-slider-thumb]:h-[15px] [&::-webkit-slider-thumb]:w-[15px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-accent [&::-webkit-slider-thumb]:bg-surface ' +
  '[&::-moz-range-track]:h-[3px] [&::-moz-range-track]:rounded-[2px] [&::-moz-range-track]:[background:var(--track-bg)] ' +
  '[&::-moz-range-thumb]:h-[15px] [&::-moz-range-thumb]:w-[15px] [&::-moz-range-thumb]:box-border [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-accent [&::-moz-range-thumb]:bg-surface';

export const ReaderToolbar = ({
  visible,
  themeBg,
  title,
  author,
  syncState,
  syncText,
  chapterLabel,
  pctQ,
  tocOpen,
  notesOpen,
  displayOpen,
  bookmarked,
  onBack,
  onOpenToc,
  onOpenDisplay,
  onToggleBookmark,
  onSeek,
}: ReaderToolbarProps) => {
  const { t } = useT();
  const pct = Number.isFinite(pctQ) ? pctQ / 10_000 : 0;
  const rangeStyle = { '--track-bg': `linear-gradient(to right, var(--color-accent) ${pct}%, var(--color-border) ${pct}%)` } as unknown as CSSProperties;
  const handleAction = (key: (typeof ACTIONS)[number]['key']) => {
    if (key === 'toc') onOpenToc();
    else if (key === 'display') onOpenDisplay();
    else if (key === 'bookmark') onToggleBookmark();
  };

  return (
    <>
      {/* mobile top bar */}
      <div
        className={`absolute inset-x-0 top-0 z-20 transition-all duration-150 md:hidden ${visible ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0 pointer-events-none'}`}
      >
        <div style={{ background: themeBg }} className="flex items-center justify-between px-2 pt-safe-top">
          <div className="flex min-w-0 items-center gap-0.5">
            <button type="button" aria-label={t('common.back')} onClick={onBack} className="flex h-11 w-11 shrink-0 items-center justify-center">
              <Icon name="back" size={22} />
            </button>
            <div className="flex min-w-0 flex-col">
              <span className="max-w-[220px] truncate font-serif text-[15px] font-semibold">{title}</span>
              <span className="text-[12px] text-muted">{author}</span>
            </div>
          </div>
          <div className="flex items-center gap-0.5 pr-1.5">
            {syncState !== 'off' ? (
              <span className={`flex h-11 w-11 items-center justify-center ${SYNC_COLOR[syncState]}`} title={syncText}>
                <Icon name={SYNC_ICON[syncState]} size={20} />
              </span>
            ) : null}
            <button type="button" aria-label={t('common.more')} className="flex h-11 w-11 items-center justify-center">
              <Icon name="more" size={22} />
            </button>
          </div>
        </div>
        {/* The fade only lives below the bar, so the opaque part always covers the
            title and author rather than letting the page text bleed through them.
            An explicit transparent stop of the same colour: `transparent` is
            rgba(0,0,0,0), which some engines fade through grey. */}
        <div style={{ background: `linear-gradient(${themeBg}, ${themeBg}00)` }} className="h-5" />
      </div>

      {/* mobile bottom bar */}
      <div
        className={`absolute inset-x-0 bottom-0 z-20 flex flex-col gap-2.5 border-t border-border bg-surface px-4 pb-[22px] pt-2.5 transition-all duration-150 md:hidden ${visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0 pointer-events-none'}`}
      >
        <div className="flex items-center gap-3">
          <span className="whitespace-nowrap text-[12.5px] text-muted">{chapterLabel}</span>
          <input type="range" min={0} max={100} step={0.1} value={pct} onChange={(e) => onSeek(Number(e.target.value) / 100)} style={rangeStyle} className={rangeClass} aria-label={t('reader.position')} />
          <span className="text-[12.5px] font-semibold text-muted">{formatPercent(pctQ)}</span>
        </div>
        <div className="flex justify-around">
          {ACTIONS.map((a) => {
            const disabled = a.key === 'highlight' || a.key === 'search';
            return (
              <button
                key={a.key}
                type="button"
                disabled={disabled}
                onClick={() => handleAction(a.key)}
                className={`flex h-[52px] w-14 flex-col items-center justify-center gap-1 ${disabled ? 'opacity-40' : ''} ${a.key === 'bookmark' && bookmarked ? 'text-accent-ink' : 'text-ink'}`}
              >
                <Icon name={a.icon} size={22} />
                <span className="text-[11px] text-muted">{t(a.label)}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* desktop top bar */}
      <div className="hidden h-[52px] items-center justify-between border-b border-border bg-surface px-4 md:flex">
        <div className="flex items-center gap-2">
          <button type="button" aria-label={t('common.back')} onClick={onBack} className="flex h-10 w-10 items-center justify-center">
            <Icon name="back" size={20} />
          </button>
          <button
            type="button"
            aria-label={t('reader.toc')}
            onClick={onOpenToc}
            className={`flex h-10 w-10 items-center justify-center rounded-[6px] ${tocOpen ? 'bg-accent-soft text-accent-ink' : ''}`}
          >
            <Icon name="list" size={20} />
          </button>
          <div className="ml-1.5 flex items-baseline gap-2">
            <span className="font-serif text-[16px] font-semibold">{title}</span>
            <span className="text-[13px] text-muted">{author}</span>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <SyncBadge state={syncState} text={syncText} />
          <button
            type="button"
            aria-label={t(bookmarked ? 'reader.bookmarkRemove' : 'reader.bookmarkAdd')}
            aria-pressed={bookmarked}
            onClick={onToggleBookmark}
            className={`flex h-10 w-10 items-center justify-center rounded-[6px] ${bookmarked ? 'bg-accent-soft text-accent-ink' : ''}`}
          >
            <Icon name="bookmark" size={20} />
          </button>
          <button type="button" aria-label={t('reader.search')} disabled className="flex h-10 w-10 items-center justify-center opacity-40">
            <Icon name="search" size={20} />
          </button>
          <button
            type="button"
            aria-label={t('reader.display')}
            onClick={onOpenDisplay}
            className={`flex h-10 w-10 items-center justify-center rounded-[6px] ${displayOpen ? 'bg-accent-soft text-accent-ink' : ''}`}
          >
            <Icon name="type" size={20} />
          </button>
        </div>
      </div>

      {/* desktop bottom strip */}
      <div
        style={{ left: tocOpen ? 300 : 0, right: notesOpen ? 300 : 0 }}
        className="pointer-events-none absolute bottom-0 z-10 hidden h-10 items-center justify-between px-8 text-[12.5px] text-faint md:flex"
      >
        <span>{chapterLabel}</span>
        <span>{formatPercent(pctQ)}</span>
      </div>
      <div style={{ left: tocOpen ? 300 : 0, right: notesOpen ? 300 : 0 }} className="pointer-events-none absolute bottom-0 hidden h-[2px] bg-border md:block">
        <div className="h-[2px] bg-accent" style={{ width: `${pct}%` }} />
      </div>
    </>
  );
};
