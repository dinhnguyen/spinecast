import { useState } from 'react';
import type { FoliateTocItem } from '../../../vendor/foliate-js/view.js';
import type { BookmarkDto, ClippingDto } from '../../shared/apiTypes';
import { BottomSheet } from '../components/BottomSheet';
import { SegmentedControl } from '../components/SegmentedControl';
import { useT } from '../i18n/LocaleProvider';
import { BookmarkList } from './BookmarkList';
import { ClippingList } from './ClippingList';

type Tab = 'toc' | 'bookmarks' | 'notes';
const TABS = [
  { value: 'toc' as Tab, label: 'reader.toc' as const },
  { value: 'bookmarks' as Tab, label: 'reader.bookmarks' as const },
  { value: 'notes' as Tab, label: 'reader.notes' as const },
];

interface FlatItem {
  item: FoliateTocItem;
  level: number;
}

const flatten = (items: FoliateTocItem[], level = 0): FlatItem[] =>
  items.flatMap((item) => [{ item, level }, ...(item.subitems ? flatten(item.subitems, level + 1) : [])]);

interface ReaderTocPanelProps {
  open: boolean;
  onClose: () => void;
  toc: FoliateTocItem[];
  currentHref: string | null;
  onSelect: (href: string) => void;
  bookmarks: BookmarkDto[];
  bookmarksLoading: boolean;
  bookmarksLoadError: unknown;
  onSelectBookmark: (xpath: string) => void;
  onRemoveBookmark: (id: string) => void;
  clippings: ClippingDto[];
  clippingsUnplaced: Set<string>;
  clippingsFixedLayout: boolean;
  clippingsLoading: boolean;
  clippingsLoadError: unknown;
  onSelectClipping: (id: string) => void;
  onRemoveClipping: (id: string) => void;
}

const TocList = ({ toc, currentHref, onSelect, fontSize }: { toc: FoliateTocItem[]; currentHref: string | null; onSelect: (href: string) => void; fontSize: number }) => {
  const { t } = useT();
  return (
    <>
      {flatten(toc).map(({ item, level }) => {
        const current = item.href === currentHref;
        return (
          <button
            key={`${item.href}-${item.label}`}
            type="button"
            onClick={() => onSelect(item.href)}
            style={{ paddingLeft: 12 + level * 16, fontSize }}
            className={`flex h-11 items-center justify-between rounded-[6px] pr-1 text-left font-serif ${current ? 'bg-accent-soft font-semibold text-accent-ink' : 'font-normal text-ink'}`}
          >
            <span className="truncate">{item.label}</span>
            {current ? <span className="pr-2 shrink-0 font-sans text-[12px] font-normal text-accent">{t('reader.current')}</span> : null}
          </button>
        );
      })}
    </>
  );
};

export const ReaderTocPanel = ({
  open,
  onClose,
  toc,
  currentHref,
  onSelect,
  bookmarks,
  bookmarksLoading,
  bookmarksLoadError,
  onSelectBookmark,
  onRemoveBookmark,
  clippings,
  clippingsUnplaced,
  clippingsFixedLayout,
  clippingsLoading,
  clippingsLoadError,
  onSelectClipping,
  onRemoveClipping,
}: ReaderTocPanelProps) => {
  const { t } = useT();
  const [tab, setTab] = useState<Tab>('toc');
  const tabOptions = TABS.map((x) => ({ value: x.value, label: t(x.label) }));
  return (
    <>
      <div className="md:hidden">
        <BottomSheet open={open} onClose={onClose} height={620}>
          <SegmentedControl options={tabOptions} value={tab} onChange={setTab} height={40} />
          {tab === 'toc' ? (
            <div className="flex flex-col gap-0.5 overflow-y-auto">
              <TocList toc={toc} currentHref={currentHref} onSelect={onSelect} fontSize={16} />
            </div>
          ) : tab === 'bookmarks' ? (
            <div className="flex flex-col overflow-y-auto">
              <BookmarkList bookmarks={bookmarks} loading={bookmarksLoading} loadError={bookmarksLoadError} onSelect={onSelectBookmark} onRemove={onRemoveBookmark} fontSize={16} />
            </div>
          ) : (
            <div className="flex flex-col overflow-y-auto">
              <ClippingList
                clippings={clippings}
                unplaced={clippingsUnplaced}
                fixedLayout={clippingsFixedLayout}
                loading={clippingsLoading}
                loadError={clippingsLoadError}
                onSelect={onSelectClipping}
                onRemove={onRemoveClipping}
                fontSize={16}
              />
            </div>
          )}
        </BottomSheet>
      </div>
      {open ? (
        <div className="hidden w-[300px] shrink-0 flex-col gap-3 overflow-y-auto border-r border-border bg-surface p-[16px_12px] md:flex">
          <SegmentedControl options={tabOptions} value={tab} onChange={setTab} height={34} />
          {tab === 'toc' ? (
            <div className="flex flex-col gap-px">
              <TocList toc={toc} currentHref={currentHref} onSelect={onSelect} fontSize={15} />
            </div>
          ) : tab === 'bookmarks' ? (
            <div className="flex flex-col overflow-y-auto">
              <BookmarkList bookmarks={bookmarks} loading={bookmarksLoading} loadError={bookmarksLoadError} onSelect={onSelectBookmark} onRemove={onRemoveBookmark} fontSize={15} />
            </div>
          ) : (
            <div className="flex flex-col overflow-y-auto">
              <ClippingList
                clippings={clippings}
                unplaced={clippingsUnplaced}
                fixedLayout={clippingsFixedLayout}
                loading={clippingsLoading}
                loadError={clippingsLoadError}
                onSelect={onSelectClipping}
                onRemove={onRemoveClipping}
                fontSize={15}
              />
            </div>
          )}
        </div>
      ) : null}
    </>
  );
};
