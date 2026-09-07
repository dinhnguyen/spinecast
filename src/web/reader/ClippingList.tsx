import type { ClippingDto } from '../../shared/apiTypes';
import { HIGHLIGHT_COLORS } from '../../shared/clipping';
import { useLocale } from '../i18n/LocaleProvider';
import { Icon } from '../lib/icons';

interface ClippingListProps {
  clippings: ClippingDto[];
  unplaced: Set<string>;
  fixedLayout: boolean;
  loading: boolean;
  loadError: unknown;
  onSelect: (id: string) => void;
  onRemove: (id: string) => void;
  fontSize: number;
}

export const ClippingList = ({ clippings, unplaced, fixedLayout, loading, loadError, onSelect, onRemove, fontSize }: ClippingListProps) => {
  const { t } = useLocale();
  if (loading) return <p className="pt-6 text-center text-[14px] text-muted">{t('reader.notesLoading')}</p>;
  if (loadError) return (
    <p role="alert" className="pt-6 text-center text-[14px] text-danger">
      {t('reader.notesLoadFailed')}
    </p>
  );
  if (clippings.length === 0) return <p className="pt-6 text-center text-[14px] text-muted">{t('reader.notesEmpty')}</p>;
  return (
    <>
      {clippings.map((c) => {
        const isUnplaced = unplaced.has(c.id);
        // `text` is never null in the schema, but an all-whitespace value would
        // still render a blank line - guard it the way BookmarkList guards `summary`.
        const excerpt = c.text.trim() ? c.text : t('reader.notesNoText');
        return (
          <div key={c.id} className="flex items-start gap-1 border-b border-border py-2.5">
            <span style={{ backgroundColor: c.color ?? HIGHLIGHT_COLORS[0] }} className="w-1 shrink-0 self-stretch rounded-full" />
            {isUnplaced ? (
              <div style={{ fontSize }} className="flex min-w-0 flex-1 flex-col gap-0.5 pl-3">
                <span className="line-clamp-2 font-serif text-ink">{excerpt}</span>
                <span className="font-sans text-[12px] text-faint">{t(fixedLayout ? 'reader.notesFixedLayout' : 'reader.notesUnplaced')}</span>
              </div>
            ) : (
              <button type="button" onClick={() => onSelect(c.id)} style={{ fontSize }} className="flex min-w-0 flex-1 flex-col gap-0.5 pl-3 text-left">
                <span className="line-clamp-2 font-serif text-ink">{excerpt}</span>
                {c.note ? <span className="line-clamp-2 font-sans text-[12px] text-muted">{c.note}</span> : null}
              </button>
            )}
            <button type="button" aria-label={t('reader.noteDelete')} onClick={() => onRemove(c.id)} className="flex h-9 w-9 shrink-0 items-center justify-center text-faint">
              <Icon name="x" size={15} />
            </button>
          </div>
        );
      })}
    </>
  );
};
