import { useState } from 'react';
import { Link } from 'react-router';
import type { AdminBookSort } from '../../shared/apiTypes';
import { Button } from '../components/Button';
import { SegmentedControl } from '../components/SegmentedControl';
import { useAdminBooks } from '../hooks/useAdminBooks';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useLocale } from '../i18n/LocaleProvider';
import { describeError } from '../lib/errorMessage';
import { formatBytes, formatDate } from '../lib/format';
import { Icon } from '../lib/icons';

export const AdminBooks = () => {
  const [sort, setSort] = useState<AdminBookSort>('size');
  const { items, loading, error, hasMore, loadMore, reload } = useAdminBooks(sort);
  const { t, locale } = useLocale();
  const desktop = useMediaQuery('(min-width: 768px)');
  const options = [
    { value: 'size' as const, label: t('admin.books.sortSize') },
    { value: 'owner' as const, label: t('admin.books.sortOwner') },
    { value: 'shared' as const, label: t('admin.books.sortShared') },
  ];
  return <div className="flex flex-col gap-4">
    <SegmentedControl options={options} value={sort} onChange={setSort} height={40} />
    {loading ? <p>{t('admin.loading')}</p> : error ? <div className="flex flex-col gap-3"><p role="alert" className="text-danger">{describeError(error, t)}</p><div><Button type="button" kind="ghost" onClick={reload}>{t('admin.retry')}</Button></div></div> : items.length === 0 ? <p className="text-muted">{t('admin.books.empty')}</p> : desktop ? (
      <table className="w-full border-collapse text-[14px]"><thead><tr className="border-b border-border text-left text-[12px] font-semibold uppercase text-muted">
        <th scope="col" className="pb-2.5 pr-3 font-semibold">{t('admin.books.filename')}</th>
        <th scope="col" className="pb-2.5 pr-3 font-semibold">{t('admin.books.owner')}</th>
        <th scope="col" className="pb-2.5 pr-3 font-semibold">{t('admin.books.size')}</th>
        <th scope="col" className="pb-2.5 pr-3 font-semibold">{t('admin.books.sharedBlob')}</th>
        <th scope="col" className="pb-2.5 pr-3 font-semibold">{t('admin.books.sharedFlag')}</th>
        <th scope="col" className="pb-2.5 pr-3 font-semibold">{t('admin.books.added')}</th>
      </tr></thead><tbody>{items.map((book) => {
        const { id, ownerId, ownerEmail, filename, filesize, shared, blobRefs, createdAt } = book;
        return <tr key={id} className="border-b border-border"><td className="py-3 pr-3 font-mono text-[13.5px]">{filename}</td><td className="pr-3"><Link to={`/admin/users/${ownerId}`} className="hover:underline">{ownerEmail}</Link></td><td className="pr-3">{formatBytes(filesize, locale)}</td><td className="pr-3">{blobRefs > 1 ? <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[12px] font-semibold text-accent-ink">x{blobRefs}</span> : null}</td><td className="pr-3">{shared ? <Icon name="check" size={16} /> : null}</td><td>{formatDate(createdAt, locale)}</td></tr>;
      })}</tbody></table>
    ) : <div className="flex flex-col">{items.map((book) => { const { id, ownerId, ownerEmail, filename, filesize, blobRefs } = book; return <div key={id} className="border-b border-border py-4"><div className="break-words font-mono text-[13.5px] text-ink">{filename}</div><div className="mt-1.5 text-[13px] text-muted"><Link to={`/admin/users/${ownerId}`} className="hover:underline">{ownerEmail}</Link> · {formatBytes(filesize, locale)}{blobRefs > 1 ? ` · x${blobRefs}` : ''}</div></div>; })}</div>}
    {hasMore ? <div><Button type="button" kind="surface" onClick={() => void loadMore()}>{t('admin.books.loadMore')}</Button></div> : null}
  </div>;
};
