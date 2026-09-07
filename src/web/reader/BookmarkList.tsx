import type { BookmarkDto } from '../../shared/apiTypes';
import { useLocale } from '../i18n/LocaleProvider';
import { formatPercent } from '../lib/format';
import { Icon } from '../lib/icons';

interface BookmarkListProps {
  bookmarks: BookmarkDto[];
  loading: boolean;
  loadError: unknown;
  onSelect: (xpath: string) => void;
  onRemove: (id: string) => void;
  fontSize: number;
}

export const BookmarkList = ({ bookmarks, loading, loadError, onSelect, onRemove, fontSize }: BookmarkListProps) => {
  const { t } = useLocale();
  if (loading) return <p className="pt-6 text-center text-[14px] text-muted">{t('reader.bookmarkLoading')}</p>;
  if (loadError) return (
    <p role="alert" className="pt-6 text-center text-[14px] text-danger">
      {t('reader.bookmarkLoadFailed')}
    </p>
  );
  if (bookmarks.length === 0) return <p className="pt-6 text-center text-[14px] text-muted">{t('reader.bookmarkEmpty')}</p>;
  return (
    <>
      {bookmarks.map((b) => {
        const percent = formatPercent(Math.round(b.percentage * 1_000_000));
        const summary = b.summary && b.summary.trim() ? b.summary : t('reader.bookmarkNoText');
        return (
          <div key={b.id} className="flex items-start gap-1 border-b border-border py-2.5">
            <button type="button" onClick={() => onSelect(b.xpath)} style={{ fontSize }} className="flex min-w-0 flex-1 flex-col gap-0.5 pl-3 text-left">
              <span className="line-clamp-2 font-serif text-ink">{summary}</span>
              <span className="font-sans text-[12px] text-faint">{b.chapter ? t('reader.bookmarkMeta', { chapter: b.chapter, percent }) : percent}</span>
            </button>
            <button type="button" aria-label={t('reader.bookmarkRemove')} onClick={() => onRemove(b.id)} className="flex h-9 w-9 shrink-0 items-center justify-center text-faint">
              <Icon name="x" size={15} />
            </button>
          </div>
        );
      })}
    </>
  );
};
