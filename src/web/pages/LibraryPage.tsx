import { useEffect, useMemo, useRef, useState } from 'react';
import { AppShell } from '../components/AppShell';
import { BookCard } from '../components/BookCard';
import { BulkActionBar } from '../components/BulkActionBar';
import { LibrarySort } from '../components/LibrarySort';
import { LibraryViewToggle } from '../components/LibraryViewToggle';
import { SyncBadge } from '../components/SyncBadge';
import { UploadDropzone } from '../components/UploadDropzone';
import { useBooks } from '../hooks/useBooks';
import { useSyncSettings } from '../hooks/useSyncSettings';
import { useToast } from '../hooks/useToast';
import { useLocale } from '../i18n/LocaleProvider';
import { ApiClientError } from '../lib/api';
import { loadSort, saveSort, sortBooks, type SortKey } from '../lib/bookSort';
import { describeError } from '../lib/errorMessage';
import { syncBadgeFor } from '../lib/format';
import { Icon } from '../lib/icons';
import { loadView, saveView, type ViewMode } from '../lib/libraryView';

const useIsDesktop = (): boolean => {
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia('(min-width: 768px)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return isDesktop;
};

export const LibraryPage = () => {
  const { books, error, upload, remove, setShared, bulkRemove, bulkSetShared } = useBooks();
  const { settings } = useSyncSettings();
  const { toast, show } = useToast();
  const { t, tn, locale } = useLocale();
  const badge = syncBadgeFor(settings, locale);
  const isDesktop = useIsDesktop();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [sort, setSort] = useState<SortKey>(loadSort);
  const [view, setView] = useState<ViewMode>(loadView);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matched = q ? books.filter((b) => b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q)) : books;
    return sortBooks(matched, sort, locale);
  }, [books, search, sort, locale]);

  const changeSort = (key: SortKey) => {
    setSort(key);
    saveSort(key);
  };

  const changeView = (mode: ViewMode) => {
    setView(mode);
    saveView(mode);
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = filtered.length > 0 && filtered.every((b) => selectedIds.has(b.id));

  const handleBulkShare = async (shared: boolean) => {
    try {
      await bulkSetShared(Array.from(selectedIds), shared);
    } catch (e) {
      show(describeError(e, t));
    }
  };

  const handleBulkDelete = async () => {
    try {
      await bulkRemove(Array.from(selectedIds));
      exitSelectMode();
    } catch (e) {
      show(describeError(e, t));
    }
  };

  const reading = books.filter((b) => b.progress && b.progress.pctQ / 10_000 < 99).length;
  const done = books.filter((b) => b.progress && b.progress.pctQ / 10_000 >= 99).length;

  const openFilePicker = () => fileInputRef.current?.click();

  const handleFiles = async (files: File[]) => {
    for (const file of files) {
      try {
        await upload(file);
      } catch (e) {
        show(describeError(e, t));
        if (e instanceof ApiClientError && e.code === 'duplicate' && e.bookId) {
          const bookId = e.bookId;
          setHighlightId(bookId);
          setTimeout(() => setHighlightId((cur) => (cur === bookId ? null : cur)), 4000);
        }
      }
    }
  };

  const handleToggleShared = async (id: string, shared: boolean) => {
    try {
      await setShared(id, shared);
    } catch (e) {
      show(describeError(e, t));
    }
  };

  return (
    <AppShell onUpload={openFilePicker} syncBadge={<SyncBadge {...badge} />}>
      <input
        ref={fileInputRef}
        type="file"
        accept=".epub"
        multiple
        hidden
        onChange={(e) => {
          void handleFiles(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />

      <div className="flex flex-col gap-3.5 px-5 pt-safe-top md:hidden">
        <div className="flex items-end justify-between">
          <h1 className="font-serif text-[30px] font-semibold tracking-[-.01em]">{t('library.title')}</h1>
          <div className="flex gap-1.5">
            <button type="button" aria-label={t('library.search')} onClick={() => setSearchOpen((v) => !v)} className="flex h-11 w-11 items-center justify-center text-ink">
              <Icon name="search" />
            </button>
            <button type="button" aria-label={t('nav.upload')} onClick={openFilePicker} className="flex h-11 w-11 items-center justify-center text-accent">
              <Icon name="upload" />
            </button>
          </div>
        </div>
        {searchOpen ? (
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('library.searchPlaceholder')}
            className="h-11 rounded-[6px] border border-border bg-surface px-3.5 text-[15px] text-ink outline-none placeholder:text-faint focus:border-accent"
          />
        ) : null}
        <div className="flex items-center justify-between">
          <SyncBadge {...badge} />
          <div className="flex items-center gap-2.5">
            {!selectMode && filtered.length > 0 ? (
              <button type="button" onClick={() => setSelectMode(true)} className="text-[13.5px] text-muted">
                {t('library.select')}
              </button>
            ) : null}
            <LibraryViewToggle value={view} onChange={changeView} />
            <LibrarySort value={sort} onChange={changeSort} variant="mobile" />
          </div>
        </div>
      </div>

      <div className="hidden flex-col gap-6 px-10 pt-9 md:flex">
        <div className="flex items-end justify-between">
          <div className="flex flex-col gap-1.5">
            <h1 className="font-serif text-[34px] font-semibold tracking-[-.01em]">{t('library.title')}</h1>
            <p className="text-[14.5px] text-muted">
              {tn('library.books', books.length)} · {t('library.reading', { count: reading })} · {t('library.done', { count: done })}
            </p>
          </div>
          <div className="flex items-center gap-3.5">
            <div className="flex h-[38px] w-[260px] items-center gap-2 rounded-[6px] border border-border bg-surface px-3.5">
              <Icon name="search" size={16} className="text-faint" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('library.searchPlaceholder')}
                className="w-full bg-transparent text-[14px] text-ink outline-none placeholder:text-faint"
              />
            </div>
            {!selectMode && filtered.length > 0 ? (
              <button type="button" onClick={() => setSelectMode(true)} className="flex h-[38px] items-center rounded-[6px] border border-border bg-surface px-3 text-[14px] text-muted">
                {t('library.select')}
              </button>
            ) : null}
            <LibraryViewToggle value={view} onChange={changeView} />
            <LibrarySort value={sort} onChange={changeSort} variant="desktop" />
          </div>
        </div>
        <UploadDropzone onFiles={(files) => void handleFiles(files)} />
      </div>

      {error ? (
        <p role="alert" className="px-5 pt-20 text-center text-[15px] text-danger">
          {describeError(error, t)}
        </p>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-1.5 px-5 pt-20 text-center">
          <p className="font-serif text-[20px] font-semibold">{t('library.empty')}</p>
          <p className="text-[15px] text-muted">{t('library.emptyHint')}</p>
        </div>
      ) : view === 'grid' ? (
        <div className="grid grid-cols-2 gap-x-[18px] gap-y-[22px] px-5 pt-[18px] md:grid-cols-6 md:gap-x-7 md:gap-y-8 md:px-10">
          {filtered.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              size={isDesktop ? 'desktop' : 'mobile'}
              onDelete={(id) => void remove(id)}
              onToggleShared={(shared) => void handleToggleShared(book.id, shared)}
              highlighted={highlightId === book.id}
              selectable={selectMode}
              selected={selectedIds.has(book.id)}
              onToggleSelect={() => toggleSelect(book.id)}
            />
          ))}
        </div>
      ) : (
        <div className="flex flex-col px-5 pt-[18px] md:px-10">
          {filtered.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              size={isDesktop ? 'desktop' : 'mobile'}
              layout="list"
              onDelete={(id) => void remove(id)}
              onToggleShared={(shared) => void handleToggleShared(book.id, shared)}
              highlighted={highlightId === book.id}
              selectable={selectMode}
              selected={selectedIds.has(book.id)}
              onToggleSelect={() => toggleSelect(book.id)}
            />
          ))}
        </div>
      )}

      {selectMode ? <div className="h-20" /> : null}
      {toast}
      {selectMode ? (
        <BulkActionBar
          count={selectedIds.size}
          allSelected={allSelected}
          onSelectAll={() => setSelectedIds(new Set(filtered.map((b) => b.id)))}
          onSelectNone={() => setSelectedIds(new Set())}
          onShare={() => void handleBulkShare(true)}
          onUnshare={() => void handleBulkShare(false)}
          onDelete={() => void handleBulkDelete()}
          onDone={exitSelectMode}
        />
      ) : null}
    </AppShell>
  );
};
