import { useRef, useState, type MouseEvent } from 'react';
import { Link } from 'react-router';
import type { BookDto } from '../../shared/apiTypes';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useT } from '../i18n/LocaleProvider';
import { formatPercent } from '../lib/format';
import { Icon } from '../lib/icons';
import { BookCardMenu } from './BookCardMenu';
import { BookCover } from './BookCover';
import { ProgressBar } from './ProgressBar';

const FONT_SIZES = { mobile: 18, desktop: 20 } as const;
const LONG_PRESS_MS = 500;

interface BookCardProps {
  book: BookDto;
  size: 'mobile' | 'desktop';
  onDelete: (id: string) => void;
  onToggleShared: (shared: boolean) => void;
  highlighted?: boolean;
  layout?: 'grid' | 'list';
  selectable?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
}

export const BookCard = ({ book, size, onDelete, onToggleShared, highlighted = false, layout = 'grid', selectable = false, selected = false, onToggleSelect }: BookCardProps) => {
  const { t } = useT();
  const font = FONT_SIZES[size];
  const percent = book.progress ? book.progress.pctQ / 10_000 : 0;
  const done = percent >= 99;
  const status = done ? t('book.done') : !book.progress ? t('book.new') : formatPercent(book.progress.pctQ);

  const isMobile = useMediaQuery('(max-width: 767px)');
  const variant = isMobile ? 'mobile' : 'desktop';
  const [menuOpen, setMenuOpen] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  const clearLongPressTimer = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handlePointerDown = () => {
    if (variant !== 'mobile' || selectable) return;
    longPressTimer.current = setTimeout(() => {
      setMenuOpen(true);
      longPressed.current = true;
    }, LONG_PRESS_MS);
  };

  const handleLinkClick = (e: MouseEvent) => {
    if (selectable) {
      e.preventDefault();
      onToggleSelect?.();
      return;
    }
    if (longPressed.current) {
      e.preventDefault();
      longPressed.current = false;
    }
  };

  const handleDelete = () => onDelete(book.id);

  // In select mode, the checkbox replaces the "..." menu as the card's only
  // affordance - opening a per-book menu mid-selection would compete with it.
  const checkbox = selectable ? (
    <button
      type="button"
      aria-label={t('book.selectAria', { title: book.title })}
      aria-pressed={selected}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggleSelect?.();
      }}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface ${selected ? 'text-accent' : 'text-muted'} ${layout === 'grid' ? 'absolute left-2 top-2 z-10 border border-control shadow-[0_1px_3px_rgba(42,37,31,.16)]' : ''}`}
    >
      <Icon name={selected ? 'checkSquare' : 'square'} size={20} />
    </button>
  ) : null;

  const sharedBadge = book.shared ? (
    <div
      aria-label={t('book.sharedBadge')}
      title={t('book.sharedBadge')}
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-surface text-accent"
    >
      <Icon name="share" size={14} />
    </div>
  ) : null;

  if (layout === 'list') {
    return (
      <div className={`flex items-center gap-3 border-b border-border py-2.5 ${highlighted ? 'ring-2 ring-accent ring-offset-2 ring-offset-bg' : ''}`}>
        {checkbox}
        <Link to={`/read/${book.id}`} className="relative w-14 shrink-0" onClick={handleLinkClick}>
          <BookCover book={book} fontSize={9} />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate font-serif text-[15px] font-medium leading-[1.25]">{book.title}</span>
          <div className="flex items-center justify-between gap-2 text-[12px] text-muted">
            <span className="truncate">{book.author}</span>
            <span className={`shrink-0 ${done ? 'text-ok' : 'text-faint'}`}>{status}</span>
          </div>
          <ProgressBar percent={percent} done={done} />
        </div>
        {sharedBadge}
        {!selectable ? (
          <div className="relative shrink-0">
            <button type="button" onClick={() => setMenuOpen(true)} aria-label={t('book.options')} className="flex h-8 w-8 items-center justify-center rounded-full text-ink">
              <Icon name="more" size={16} />
            </button>
            <BookCardMenu open={menuOpen} onClose={() => setMenuOpen(false)} book={book} variant={variant} onToggleShared={onToggleShared} onDelete={handleDelete} />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className={`group relative rounded-[3px] ${highlighted ? 'ring-2 ring-accent ring-offset-2 ring-offset-bg' : ''}`}>
        <Link
          to={`/read/${book.id}`}
          className="block"
          onClick={handleLinkClick}
          onPointerDown={handlePointerDown}
          onPointerUp={clearLongPressTimer}
          onPointerLeave={clearLongPressTimer}
          onPointerCancel={clearLongPressTimer}
        >
          <BookCover book={book} fontSize={font} />
        </Link>
        {checkbox}
        {!selectable ? (
          <>
            <button
              type="button"
              // Opens only (never toggles): a document-level pointerdown listener in
              // BookCardMenu closes the menu on any outside click, including this
              // button's own pointerdown, right before its click handler would run -
              // a toggle here would immediately reopen what that listener just closed.
              onClick={() => setMenuOpen(true)}
              aria-label={t('book.options')}
              className={`absolute right-2 top-2 hidden h-8 w-8 items-center justify-center rounded-full border border-control bg-surface text-ink shadow-[0_1px_3px_rgba(42,37,31,.16)] md:flex ${menuOpen ? 'md:opacity-100' : 'md:opacity-0 md:group-hover:opacity-100 md:focus:opacity-100'}`}
            >
              <Icon name="more" size={16} />
            </button>
            <button
              type="button"
              // Below md there is no visible trigger (matches the mockup) and the primary
              // entry point is a long-press, which keyboard/assistive-tech users can't
              // perform. This gives them a real, focusable button: sr-only by default (a
              // 1x1px clipped box, so it steals no taps from the cover Link) and revealed
              // via focus:not-sr-only + focus:* sizing/position on Tab. All the visual
              // classes are focus-scoped rather than plain (e.g. focus:h-8 not h-8) so
              // they don't fight sr-only's own width/height/position reset at equal
              // specificity - verified against this project's compiled Tailwind output.
              onClick={() => setMenuOpen(true)}
              aria-label={t('book.options')}
              className="sr-only focus:not-sr-only focus:absolute focus:right-2 focus:top-2 focus:z-30 focus:flex focus:h-8 focus:w-8 focus:items-center focus:justify-center focus:rounded-full focus:border focus:border-control focus:bg-surface focus:text-ink focus:shadow-[0_1px_3px_rgba(42,37,31,.16)] md:hidden"
            >
              <Icon name="more" size={16} />
            </button>
            {menuOpen ? (
              <button
                type="button"
                onClick={() => setMenuOpen((v) => !v)}
                aria-label={t('book.options')}
                className="absolute right-0 top-0 flex h-11 w-11 items-center justify-center bg-transparent md:hidden"
              />
            ) : null}
            <BookCardMenu open={menuOpen} onClose={() => setMenuOpen(false)} book={book} variant={variant} onToggleShared={onToggleShared} onDelete={handleDelete} />
          </>
        ) : null}
        {sharedBadge ? <div className="absolute bottom-2 right-2">{sharedBadge}</div> : null}
      </div>
      <ProgressBar percent={percent} done={done} />
      <div className="flex flex-col gap-0.5">
        <span className="truncate font-serif text-[15px] font-medium leading-[1.25]">{book.title}</span>
        <div className="flex items-center justify-between gap-2 text-[12px] text-muted">
          <span className="truncate">{book.author}</span>
          <span className={`shrink-0 ${done ? 'text-ok' : 'text-faint'}`}>{status}</span>
        </div>
      </div>
    </div>
  );
};
