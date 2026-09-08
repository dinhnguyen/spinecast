import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { SectionShell } from '../components/SectionShell';
import { useAdminUserDetail } from '../hooks/useAdminUserDetail';
import { useToast } from '../hooks/useToast';
import { useLocale } from '../i18n/LocaleProvider';
import { ADMIN_NAV } from '../lib/adminNav';
import { ApiClientError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { describeError } from '../lib/errorMessage';
import { formatBytes, formatDate, formatRelative } from '../lib/format';
import { Icon } from '../lib/icons';

type Pending = { kind: 'device' | 'passkey'; id: string; name: string };

export const AdminUserDetail = () => {
  const { id = '' } = useParams<{ id: string }>();
  const { detail, loading, error, reload, revokeDevice, removePasskey } = useAdminUserDetail(id);
  const { user } = useAuth();
  const { t, locale } = useLocale();
  const { toast, show } = useToast();
  const [pending, setPending] = useState<Pending | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const confirm = async () => {
    if (!pending) return;
    const action = pending;
    setPending(null);
    setActionError(null);
    try {
      if (action.kind === 'device') await revokeDevice(action.id);
      else await removePasskey(action.id);
      show(t('admin.detail.revoked'));
    } catch (caught) { setActionError(describeError(caught, t)); }
  };
  const message = pending?.kind === 'device'
    ? `${t('admin.detail.revokeDeviceConfirm', { name: pending.name })}${pending.id === user?.deviceId ? ` ${t('admin.detail.revokeOwnDeviceConfirm')}` : ''}`
    : pending ? t('admin.detail.removePasskeyConfirm', { name: pending.name }) : '';
  return (
    <SectionShell title={detail?.email ?? ''} backTo="/admin/users" rows={ADMIN_NAV} active="users">
      {loading ? <p>{t('admin.loading')}</p> : error instanceof ApiClientError && error.status === 404 ? (
        <div className="flex flex-col gap-3"><p>{t('admin.detail.notFound')}</p><Link to="/admin/users" className="text-accent-ink hover:underline">{t('admin.detail.back')}</Link></div>
      ) : error ? (
        <div className="flex flex-col gap-3"><p role="alert" className="text-danger">{describeError(error, t)}</p><div><Button type="button" kind="ghost" onClick={() => void reload()}>{t('admin.retry')}</Button></div></div>
      ) : detail ? (
        <div className="flex flex-col gap-6">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg border border-border bg-surface p-5 md:grid-cols-3">
            {[[t('admin.role'), detail.role === 'admin' ? t('admin.roleAdmin') : t('admin.roleUser')], [t('admin.status'), detail.disabledAt ? t('admin.disabled') : t('admin.active')], [t('admin.detail.created'), formatDate(detail.createdAt, locale)], [t('admin.books'), String(detail.bookCount)], [t('admin.storage'), formatBytes(detail.bytesUsed, locale)], [t('admin.lastSeen'), detail.lastSeenAt ? formatRelative(detail.lastSeenAt, locale) : t('admin.neverSeen')]].map(([label, value]) => <div key={label}><dt className="text-[12px] text-muted">{label}</dt><dd className="mt-1 text-[14px] font-semibold text-ink">{value}</dd></div>)}
          </dl>
          <section className="flex flex-col gap-2"><h3 className="font-serif text-[22px] font-semibold">{t('admin.detail.devices')}</h3>{detail.devices.length === 0 ? <p className="text-muted">{t('admin.detail.noDevices')}</p> : detail.devices.map((device) => <div key={device.id} className="flex min-h-[52px] items-center justify-between gap-3 border-b border-border"><div><div className="text-ink">{device.name}</div><div className="text-[13px] text-faint">{t('settings.devices.lastSeen', { when: formatRelative(device.lastSeenAt, locale) })}</div></div><button type="button" aria-label={t('admin.detail.revokeDevice', { name: device.name })} onClick={() => setPending({ kind: 'device', id: device.id, name: device.name })} className="flex h-9 w-9 items-center justify-center rounded-md border border-control text-danger"><Icon name="x" size={16} /></button></div>)}</section>
          <section className="flex flex-col gap-2"><h3 className="font-serif text-[22px] font-semibold">{t('admin.detail.passkeys')}</h3>{detail.passkeys.length === 0 ? <p className="text-muted">{t('admin.detail.noPasskeys')}</p> : detail.passkeys.map((passkey) => <div key={passkey.id} className="flex min-h-[52px] items-center justify-between gap-3 border-b border-border"><div><div className="text-ink">{passkey.name}</div><div className="text-[13px] text-faint">{t('passkeys.created', { date: formatDate(passkey.createdAt, locale) })} · {passkey.lastUsedAt ? t('passkeys.lastUsed', { when: formatRelative(passkey.lastUsedAt, locale) }) : t('passkeys.neverUsed')}</div></div><button type="button" aria-label={t('admin.detail.removePasskey', { name: passkey.name })} onClick={() => setPending({ kind: 'passkey', id: passkey.id, name: passkey.name })} className="flex h-9 w-9 items-center justify-center rounded-md border border-control text-danger"><Icon name="x" size={16} /></button></div>)}</section>
          {actionError ? <p role="alert" className="text-danger">{actionError}</p> : null}
        </div>
      ) : null}
      <ConfirmDialog open={pending !== null} message={message} confirmLabel={t('admin.delete')} onConfirm={() => void confirm()} onCancel={() => setPending(null)} />
      {toast}
    </SectionShell>
  );
};
