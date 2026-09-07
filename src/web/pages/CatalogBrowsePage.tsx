import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import type { BookDto, OpdsEntryDto, OpdsFeedDto, OpdsLinkDto } from '../../shared/apiTypes';
import { AppShell } from '../components/AppShell';
import { Button } from '../components/Button';
import { SyncBadge } from '../components/SyncBadge';
import { useSyncSettings } from '../hooks/useSyncSettings';
import { useLocale } from '../i18n/LocaleProvider';
import { ApiClientError, api } from '../lib/api';
import { describeError } from '../lib/errorMessage';
import { syncBadgeFor } from '../lib/format';
import { Icon } from '../lib/icons';

interface Crumb {
  label: string;
  href: string | null;
}

export const CatalogBrowsePage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { settings } = useSyncSettings();
  const { t, locale } = useLocale();
  const badge = syncBadgeFor(settings, locale);

  const href = searchParams.get('href');

  const [feed, setFeed] = useState<OpdsFeedDto | null>(null);
  const [error, setError] = useState<unknown>(null);
  // The trail is client-side only: the server has no notion of "where you came
  // from", so a fresh mount can show just the current level, never the ancestors.
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [downloadingIds, setDownloadingIds] = useState<Set<string>>(new Set());
  const [failedCovers, setFailedCovers] = useState<Set<string>>(new Set());
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => setCrumbs([]), [id]);

  const load = useCallback(
    async (targetHref: string | null) => {
      if (!id) return;
      setError(null);
      try {
        const query = targetHref ? `?href=${encodeURIComponent(targetHref)}` : '';
        const data = await api.get<OpdsFeedDto>(`/api/opds/catalogs/${id}/browse${query}`);
        setFeed(data);
        setCrumbs((prev) => (prev.length === 0 ? [{ label: data.title, href: targetHref }] : prev));
      } catch (err) {
        setError(err);
      }
    },
    [id],
  );

  useEffect(() => {
    void load(href);
  }, [load, href]);

  const goTo = (nextHref: string | null) => setSearchParams(nextHref ? { href: nextHref } : {});

  const onNavigate = (link: OpdsLinkDto) => {
    setCrumbs((prev) => [...prev, { label: link.title, href: link.href }]);
    goTo(link.href);
  };

  const onCrumbClick = (index: number) => {
    const target = crumbs[index];
    if (!target) return;
    setCrumbs((prev) => prev.slice(0, index + 1));
    goTo(target.href);
  };

  const onBack = () => {
    if (crumbs.length > 1) {
      const target = crumbs[crumbs.length - 2]!;
      setCrumbs((prev) => prev.slice(0, -1));
      goTo(target.href);
    } else {
      navigate('/catalogs');
    }
  };

  const onSearchSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!feed?.searchTemplate) return;
    goTo(feed.searchTemplate.replace('{searchTerms}', encodeURIComponent(searchTerm)));
  };

  const loadMore = async () => {
    if (!id || !feed?.next || loadingMore) return;
    setLoadingMore(true);
    try {
      const data = await api.get<OpdsFeedDto>(`/api/opds/catalogs/${id}/browse?href=${encodeURIComponent(feed.next)}`);
      setFeed((prev) => (prev ? { ...prev, entries: [...prev.entries, ...data.entries], next: data.next } : data));
    } catch (err) {
      setError(err);
    } finally {
      setLoadingMore(false);
    }
  };

  const onDownload = async (entry: OpdsEntryDto) => {
    if (!id || !entry.acquisition) return;
    setDownloadingIds((prev) => new Set(prev).add(entry.id));
    const setInLibrary = (bookId: string) =>
      setFeed((prev) => (prev ? { ...prev, entries: prev.entries.map((e) => (e.id === entry.id ? { ...e, inLibrary: bookId } : e)) } : prev));
    try {
      const book = await api.post<BookDto>(`/api/opds/catalogs/${id}/import`, { href: entry.acquisition, entryId: entry.id });
      setInLibrary(book.id);
    } catch (err) {
      if (err instanceof ApiClientError && err.code === 'duplicate' && err.bookId) setInLibrary(err.bookId);
      else setError(err);
    } finally {
      setDownloadingIds((prev) => {
        const next = new Set(prev);
        next.delete(entry.id);
        return next;
      });
    }
  };

  const breadcrumb = (
    <div className="flex flex-wrap items-center gap-1.5 text-[15px]">
      {crumbs.flatMap((c, i) => {
        const isLast = i === crumbs.length - 1;
        const label = isLast ? (
          <span key={`l-${i}`} className="font-semibold text-ink">
            {c.label}
          </span>
        ) : (
          <button key={`l-${i}`} type="button" onClick={() => onCrumbClick(i)} className="bg-transparent p-0 font-normal text-faint">
            {c.label}
          </button>
        );
        return i === 0 ? [label] : [<Icon key={`c-${i}`} name="chev" size={14} className="text-faint" />, label];
      })}
    </div>
  );

  const searchBox = feed?.searchTemplate ? (
    <form
      onSubmit={onSearchSubmit}
      className="mx-5 mt-3.5 flex h-11 items-center gap-2 rounded-[6px] border border-control bg-surface px-3.5 text-[15px] text-faint md:mx-10 md:mt-6 md:w-[360px]"
    >
      <Icon name="search" size={18} />
      <input
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        placeholder={t('catalogs.searchPlaceholder')}
        className="w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-faint"
      />
    </form>
  ) : null;

  const renderNavRow = (link: OpdsLinkDto, i: number) => (
    <button
      key={`nav-${i}`}
      type="button"
      onClick={() => onNavigate(link)}
      className="flex w-full items-center justify-between gap-3 border-b border-border bg-transparent py-[11px] text-left"
    >
      <span className="flex flex-col gap-0.5">
        <span className="text-[15px] font-medium text-ink">{link.title}</span>
        {link.content ? <span className="text-[13.5px] text-muted">{link.content}</span> : null}
      </span>
      <Icon name="chev" size={20} className="shrink-0 text-faint" />
    </button>
  );

  const renderBookRow = (entry: OpdsEntryDto) => {
    const isDownloading = downloadingIds.has(entry.id);
    const showCover = entry.coverHref && !failedCovers.has(entry.id);
    return (
      <div key={entry.id} className="flex items-center gap-3.5 border-b border-border py-[11px]">
        <div className="h-[62px] w-11 shrink-0 rounded-[3px] border border-border bg-surface">
          {showCover ? (
            <img
              src={`/api/opds/catalogs/${id}/image?href=${encodeURIComponent(entry.coverHref!)}`}
              alt=""
              loading="lazy"
              onError={() => setFailedCovers((prev) => new Set(prev).add(entry.id))}
              className="h-full w-full rounded-[3px] object-cover"
            />
          ) : null}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="truncate text-[15px] font-medium text-ink">{entry.title}</span>
          <span className="text-[13.5px] text-muted">{entry.author}</span>
        </div>
        {entry.inLibrary ? (
          <span className="text-[13.5px] font-semibold text-ok">{t('catalogs.inLibrary')}</span>
        ) : isDownloading ? (
          <span className="text-[13.5px] text-muted">{t('catalogs.downloading')}</span>
        ) : entry.acquisition !== null ? (
          <Button kind="ghost" height={34} onClick={() => void onDownload(entry)}>
            {t('catalogs.download')}
          </Button>
        ) : null}
      </div>
    );
  };

  const isEmpty = feed !== null && feed.entries.length === 0 && feed.nav.length === 0;

  return (
    <AppShell syncBadge={<SyncBadge {...badge} />}>
      <div className="flex flex-col gap-3.5 px-5 pt-safe-top md:hidden">
        <div className="-ml-3 flex items-center gap-0.5">
          <button type="button" aria-label={t('common.back')} onClick={onBack} className="flex h-11 w-11 items-center justify-center text-ink">
            <Icon name="back" />
          </button>
          {breadcrumb}
        </div>
      </div>

      <div className="hidden items-center gap-2 px-10 pt-9 md:flex">
        <button type="button" aria-label={t('common.back')} onClick={onBack} className="-ml-2.5 flex h-10 w-10 items-center justify-center text-ink">
          <Icon name="back" size={20} />
        </button>
        {breadcrumb}
      </div>

      {searchBox}

      <div className="flex flex-col gap-0.5 px-5 pt-3.5 md:max-w-[640px] md:gap-5 md:px-10 md:pt-6">
        {error ? (
          <p role="alert" className="text-[13.5px] text-danger">
            {describeError(error, t)}
          </p>
        ) : null}
        {feed ? (
          isEmpty ? (
            <p className="text-[14px] text-faint">{t('catalogs.emptyFeed')}</p>
          ) : (
            <>
              <div className="flex flex-col gap-0.5 md:gap-0">
                {feed.nav.map(renderNavRow)}
                {feed.entries.map(renderBookRow)}
              </div>
              {feed.next ? (
                <Button kind="ghost" className="w-full md:w-auto" disabled={loadingMore} onClick={() => void loadMore()}>
                  {t('catalogs.loadMore')}
                </Button>
              ) : null}
            </>
          )
        ) : null}
      </div>
    </AppShell>
  );
};
