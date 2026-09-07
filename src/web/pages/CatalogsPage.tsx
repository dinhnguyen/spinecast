import { useState } from 'react';
import { NavLink } from 'react-router';
import type { OpdsCatalogDto } from '../../shared/apiTypes';
import { AppShell } from '../components/AppShell';
import { Button } from '../components/Button';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Field } from '../components/Field';
import { SyncBadge } from '../components/SyncBadge';
import { type CatalogInput, useOpdsCatalogs } from '../hooks/useOpdsCatalogs';
import { useSyncSettings } from '../hooks/useSyncSettings';
import { useLocale, type Translate } from '../i18n/LocaleProvider';
import { isMessageKey } from '../i18n/messages';
import { describeError } from '../lib/errorMessage';
import { formatRelative, syncBadgeFor } from '../lib/format';
import { Icon } from '../lib/icons';

const EMPTY_INPUT: CatalogInput = { name: '', url: '', username: '', password: '' };

const catalogErrorText = (code: string, t: Translate): string => {
  const key = `errors.${code}`;
  return isMessageKey(key) ? t(key) : t('errors.unknown');
};

export const CatalogsPage = () => {
  const { catalogs, loading, loadError, create, update, remove } = useOpdsCatalogs();
  const { settings } = useSyncSettings();
  const { t, locale } = useLocale();
  const badge = syncBadgeFor(settings, locale);

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [input, setInput] = useState<CatalogInput>(EMPTY_INPUT);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const openAdd = () => {
    setEditingId(null);
    setInput(EMPTY_INPUT);
    setFormError(null);
    setFormOpen(true);
  };

  const openEdit = (c: OpdsCatalogDto) => {
    setEditingId(c.id);
    setInput({ name: c.name, url: c.url, username: c.username, password: '' });
    setFormError(null);
    setFormOpen(true);
  };

  const closeForm = () => setFormOpen(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setSaving(true);
    try {
      if (editingId) await update(editingId, input);
      else await create(input);
      setFormOpen(false);
    } catch (err) {
      setFormError(describeError(err, t));
    } finally {
      setSaving(false);
    }
  };

  const confirmTarget = catalogs?.find((c) => c.id === confirmId) ?? null;

  const onDelete = async () => {
    if (!confirmTarget) return;
    setConfirmId(null);
    await remove(confirmTarget.id);
  };

  const renderRow = (c: OpdsCatalogDto) => {
    const status = c.lastError
      ? { text: catalogErrorText(c.lastError, t), danger: true }
      : c.lastOkAt
        ? { text: t('catalogs.statusOk', { when: formatRelative(c.lastOkAt, locale) }), danger: false }
        : { text: t('catalogs.statusNever'), danger: false };
    return (
      <div key={c.id} className="flex items-center border-b border-border py-[11px]">
        <NavLink to={`/catalogs/${c.id}`} className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[15px] font-medium text-ink">{c.name}</span>
          <span className="text-[13.5px] text-muted">{new URL(c.url).host}</span>
          <span className={`text-[13.5px] ${status.danger ? 'text-danger' : 'text-muted'}`}>{status.text}</span>
        </NavLink>
        <Button kind="ghost" height={36} className="ml-3" onClick={() => openEdit(c)}>
          {t('catalogs.edit')}
        </Button>
        <button
          type="button"
          aria-label={t('catalogs.delete')}
          onClick={() => setConfirmId(c.id)}
          className="ml-1.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[6px] border border-control text-muted"
        >
          <Icon name="x" size={16} />
        </button>
        <NavLink to={`/catalogs/${c.id}`} className="ml-1.5 flex shrink-0 items-center">
          <Icon name="chev" size={20} className="text-faint" />
        </NavLink>
      </div>
    );
  };

  const listSection = loading ? null : loadError ? (
    <p role="alert" className="text-[13.5px] text-danger">
      {describeError(loadError, t)}
    </p>
  ) : catalogs && catalogs.length > 0 ? (
    <div className="flex flex-col gap-[7px] md:gap-0">{catalogs.map(renderRow)}</div>
  ) : (
    <p className="text-[14px] text-faint">{t('catalogs.empty')}</p>
  );

  const formSection = (
    <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-4">
      <Field label={t('catalogs.name')} height={44} value={input.name} onChange={(e) => setInput((v) => ({ ...v, name: e.target.value }))} />
      <Field
        label={t('catalogs.url')}
        height={44}
        mono
        type="url"
        value={input.url}
        onChange={(e) => setInput((v) => ({ ...v, url: e.target.value }))}
      />
      <Field label={t('catalogs.username')} height={44} value={input.username} onChange={(e) => setInput((v) => ({ ...v, username: e.target.value }))} />
      <Field
        label={t('catalogs.password')}
        height={44}
        type="password"
        hint={t('catalogs.passwordKeep')}
        value={input.password}
        onChange={(e) => setInput((v) => ({ ...v, password: e.target.value }))}
      />
      {formError ? (
        <p role="alert" className="text-[13.5px] text-danger">
          {formError}
        </p>
      ) : null}
      <div className="flex gap-2.5">
        <Button type="submit" disabled={saving}>
          {t('catalogs.save')}
        </Button>
        <Button type="button" kind="ghost" disabled={saving} onClick={closeForm}>
          {t('catalogs.cancel')}
        </Button>
      </div>
    </form>
  );

  return (
    <AppShell syncBadge={<SyncBadge {...badge} />}>
      <div className="flex flex-col gap-3.5 px-5 pt-safe-top md:hidden">
        <div className="flex items-end justify-between">
          <h1 className="font-serif text-[30px] font-semibold tracking-[-.01em]">{t('catalogs.title')}</h1>
          <Button height={40} onClick={openAdd}>
            {t('catalogs.add')}
          </Button>
        </div>
      </div>

      <div className="hidden items-end justify-between px-10 pt-9 md:flex">
        <h1 className="font-serif text-[34px] font-semibold tracking-[-.01em]">{t('catalogs.title')}</h1>
        <Button height={40} onClick={openAdd}>{t('catalogs.add')}</Button>
      </div>

      <div className="flex flex-col gap-[7px] px-5 pt-[11px] md:max-w-[640px] md:gap-6 md:px-10 md:pt-6">
        {listSection}
        {formOpen ? formSection : null}
      </div>

      <ConfirmDialog
        open={confirmTarget !== null}
        message={t('catalogs.deleteConfirm', { name: confirmTarget?.name ?? '' })}
        confirmLabel={t('catalogs.delete')}
        onConfirm={() => void onDelete()}
        onCancel={() => setConfirmId(null)}
      />
    </AppShell>
  );
};
