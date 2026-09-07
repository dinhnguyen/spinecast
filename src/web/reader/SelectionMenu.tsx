import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { HIGHLIGHT_COLORS } from '../../shared/clipping';
import { useT } from '../i18n/LocaleProvider';
import { Icon } from '../lib/icons';

// The menu floats above the selection, flipping below it when there is not
// enough room above (e.g. a selection starting near the top of the viewport).
const FLIP_THRESHOLD = 60;
const GAP = 8;
// Breathing room from the left/right viewport edges, matching the reader's
// other chrome rather than clamping flush to 0/innerWidth.
const EDGE_MARGIN = 8;

interface SelectionMenuProps {
  rect: DOMRect;
  onHighlight: (color: string) => void;
  onNote: () => void;
  onBookmark: () => void;
  onCopy: () => void;
}

export const SelectionMenu = ({ rect, onHighlight, onNote, onBookmark, onCopy }: SelectionMenuProps) => {
  const { t } = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [centerX, setCenterX] = useState(rect.left + rect.width / 2);

  // The pill's width depends on its rendered content, so the centre it can
  // occupy without spilling off-screen is only known after mount - measure
  // it rather than guess a constant. Runs before paint, so there is no
  // visible jump from the unclamped first-render value.
  useLayoutEffect(() => {
    const raw = rect.left + rect.width / 2;
    const half = (ref.current?.offsetWidth ?? 0) / 2;
    const min = EDGE_MARGIN + half;
    const max = window.innerWidth - EDGE_MARGIN - half;
    // A pill wider than the viewport minus both margins has no centre that
    // keeps both edges inside them; centre it in the viewport instead of
    // pinning it against one edge.
    setCenterX(min > max ? window.innerWidth / 2 : Math.min(Math.max(raw, min), max));
  }, [rect]);

  const below = rect.top < FLIP_THRESHOLD;
  const style: CSSProperties = {
    left: centerX,
    transform: 'translateX(-50%)',
    ...(below ? { top: rect.bottom + GAP } : { bottom: window.innerHeight - rect.top + GAP }),
  };

  return (
    <div
      ref={ref}
      style={style}
      className="fixed z-50 flex items-center gap-2 rounded-full bg-dark px-3 py-2 text-[#f1eadf] shadow-[0_8px_24px_rgba(42,37,31,.28)]"
    >
      {HIGHLIGHT_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={t('reader.highlight')}
          onClick={() => onHighlight(color)}
          style={{ backgroundColor: color }}
          className="h-[22px] w-[22px] shrink-0 rounded-full"
        />
      ))}
      <span className="h-5 w-px shrink-0 bg-current opacity-25" />
      <button type="button" aria-label={t('reader.addNote')} onClick={onNote} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
        <Icon name="highlight" size={18} />
      </button>
      <button type="button" aria-label={t('reader.bookmark')} onClick={onBookmark} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
        <Icon name="bookmark" size={18} />
      </button>
      <button type="button" aria-label={t('reader.copy')} onClick={onCopy} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full">
        <Icon name="copy" size={18} />
      </button>
    </div>
  );
};
