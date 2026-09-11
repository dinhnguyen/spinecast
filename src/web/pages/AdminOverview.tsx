import { useState } from 'react';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useAdminOverview } from '../hooks/useAdminOverview';
import { useToast } from '../hooks/useToast';
import { useLocale } from '../i18n/LocaleProvider';
import { describeError } from '../lib/errorMessage';
import { formatBytes, formatNumber } from '../lib/format';

const Figure = ({ label, value }: { label: string; value: string }) => (
  <div className="flex flex-col gap-1">
    <span className="text-[13px] text-faint">{label}</span>
    <span className="font-serif text-[28px]">{value}</span>
  </div>
);

export const AdminOverview = () => {
  const { t, locale } = useLocale();
  const { overview, loading, error, reload, cleanup, rehash } = useAdminOverview();
  const { toast, show } = useToast();
  const [confirming, setConfirming] = useState(false);
  const [cleaning, setCleaning] = useState(false);
  const [cleanupError, setCleanupError] = useState<string | null>(null);
  const [rehashConfirming, setRehashConfirming] = useState(false);
  const [rehashing, setRehashing] = useState(false);

  if (loading) return <p>{t('admin.loading')}</p>;

  if (error || !overview) {
    return (
      <div className="flex flex-col items-start gap-3">
        <p role="alert" className="text-[13.5px] text-danger">
          {describeError(error, t)}
        </p>
        <Button kind="surface" onClick={() => void reload()}>
          {t('admin.retry')}
        </Button>
      </div>
    );
  }

  const orphanCount = overview.orphanBlobRows + overview.orphanObjects;

  const handleCleanup = async () => {
    setConfirming(false);
    setCleanupError(null);
    setCleaning(true);
    try {
      await cleanup();
      await reload();
      show(t('admin.cleaned'));
    } catch (e) {
      setCleanupError(describeError(e, t));
    } finally {
      setCleaning(false);
    }
  };

  const handleRehash = async () => {
    setRehashConfirming(false);
    setCleanupError(null);
    setRehashing(true);
    try {
      const { updated, missing } = await rehash();
      show(t('admin.rehashed', { updated, missing }));
    } catch (e) {
      setCleanupError(describeError(e, t));
    } finally {
      setRehashing(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-5 rounded-lg border border-border bg-surface p-5 md:grid-cols-4">
        <Figure label={t('admin.users')} value={formatNumber(overview.users, locale)} />
        <Figure label={t('admin.books')} value={formatNumber(overview.books, locale)} />
        <Figure label={t('admin.blobs')} value={formatNumber(overview.blobs, locale)} />
        <Figure label={t('admin.storage')} value={formatBytes(overview.blobBytes, locale)} />
      </div>
      {orphanCount > 0 ? (
        <div className="flex items-center gap-3">
          <span className="text-[13.5px] text-muted">{t('admin.orphans', { rows: overview.orphanBlobRows, objects: overview.orphanObjects })}</span>
          <Button
            kind="surface"
            onClick={() => {
              setCleanupError(null);
              setConfirming(true);
            }}
            disabled={cleaning}
          >
            {t('admin.cleanup')}
          </Button>
        </div>
      ) : null}
      <div className="flex items-center gap-3">
        <Button
          kind="surface"
          onClick={() => {
            setCleanupError(null);
            setRehashConfirming(true);
          }}
          disabled={rehashing}
        >
          {rehashing ? t('admin.rehashing') : t('admin.rehash')}
        </Button>
      </div>
      {cleanupError ? (
        <p role="alert" className="text-[13.5px] text-danger">
          {cleanupError}
        </p>
      ) : null}
      <ConfirmDialog
        open={rehashConfirming}
        message={t('admin.rehashConfirm')}
        confirmLabel={t('admin.rehash')}
        onConfirm={() => void handleRehash()}
        onCancel={() => setRehashConfirming(false)}
      />
      <ConfirmDialog
        open={confirming}
        message={t('admin.cleanupConfirm')}
        confirmLabel={t('admin.cleanup')}
        onConfirm={() => void handleCleanup()}
        onCancel={() => setConfirming(false)}
      />
      {toast}
    </div>
  );
};
