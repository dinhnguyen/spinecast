import { useState } from 'react';
import type { AdminUserDto } from '../../shared/apiTypes';
import { Button } from '../components/Button';
import { DeleteUserDialog } from '../components/DeleteUserDialog';
import { ResetCodeDialog } from '../components/ResetCodeDialog';
import { UserRowMenu } from '../components/UserRowMenu';
import { useAdminUsers } from '../hooks/useAdminUsers';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../lib/auth';
import { describeError } from '../lib/errorMessage';
import { formatBytes, formatRelative } from '../lib/format';
import { useLocale } from '../i18n/LocaleProvider';
import { Icon } from '../lib/icons';

export const AdminUsers = () => {
  const { t, tn, locale } = useLocale();
  const { user: me } = useAuth();
  const { users, loading, error, reload, patch, remove, issueReset } = useAdminUsers();
  const { toast, show } = useToast();
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const [menuUserId, setMenuUserId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [resetCode, setResetCode] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUserDto | null>(null);

  const run = async (fn: () => Promise<void>): Promise<void> => {
    setActionError(null);
    try {
      await fn();
    } catch (e) {
      setActionError(describeError(e, t));
    }
  };

  const handleChangeRole = (u: AdminUserDto) =>
    run(async () => {
      await patch(u.id, { role: u.role === 'admin' ? 'user' : 'admin' });
      show(t('admin.saved'));
    });

  const handleToggleLock = (u: AdminUserDto) =>
    run(async () => {
      await patch(u.id, { disabled: !u.disabledAt });
      show(t('admin.saved'));
    });

  const handleIssueReset = (u: AdminUserDto) =>
    run(async () => {
      const dto = await issueReset(u.id);
      setResetCode(dto.code);
    });

  const handleDeleteConfirmed = () => {
    const target = deleteTarget;
    if (!target) return;
    setDeleteTarget(null);
    void run(async () => {
      await remove(target.id);
      show(t('admin.deleted'));
    });
  };

  if (loading) return <p>{t('admin.loading')}</p>;

  if (error) {
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

  if (users.length === 0) return <p className="text-[14px] text-faint">{t('admin.noUsers')}</p>;

  const menuFor = (u: AdminUserDto, variant: 'desktop' | 'mobile') => (
    <UserRowMenu
      open={menuUserId === u.id}
      onClose={() => setMenuUserId(null)}
      user={u}
      variant={variant}
      onChangeRole={() => void handleChangeRole(u)}
      onToggleLock={() => void handleToggleLock(u)}
      onIssueReset={() => void handleIssueReset(u)}
      onDelete={() => setDeleteTarget(u)}
    />
  );

  return (
    <div className="flex flex-col gap-3">
      {isDesktop ? (
        <table className="w-full border-collapse text-[14px]">
          <thead>
            <tr className="border-b border-border text-left text-[12.5px] font-semibold uppercase tracking-[.04em] text-muted">
              <th scope="col" className="pb-2.5 font-semibold">{t('admin.email')}</th>
              <th scope="col" className="pb-2.5 font-semibold">{t('admin.role')}</th>
              <th scope="col" className="pb-2.5 font-semibold">{t('admin.books')}</th>
              <th scope="col" className="pb-2.5 font-semibold">{t('admin.storage')}</th>
              <th scope="col" className="pb-2.5 font-semibold">{t('admin.lastSeen')}</th>
              <th scope="col" className="pb-2.5 font-semibold">{t('admin.status')}</th>
              <th scope="col" className="pb-2.5" />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="relative h-[52px] border-b border-border">
                <td className="text-ink">{u.email}</td>
                <td className="font-mono text-[13.5px] text-muted">{u.role === 'admin' ? t('admin.roleAdmin') : t('admin.roleUser')}</td>
                <td className="font-mono text-[13.5px] text-muted">{u.bookCount}</td>
                <td className="font-mono text-[13.5px] text-muted">{formatBytes(u.bytesUsed, locale)}</td>
                <td className="font-mono text-[13.5px] text-muted">{u.lastSeenAt ? formatRelative(u.lastSeenAt, locale) : t('admin.neverSeen')}</td>
                <td className={u.disabledAt ? 'font-semibold text-danger' : 'text-muted'}>{u.disabledAt ? t('admin.disabled') : t('admin.active')}</td>
                <td className="relative">
                  {u.id !== me?.id ? (
                    <>
                      <button
                        type="button"
                        aria-label={t('admin.actions', { email: u.email })}
                        onClick={() => setMenuUserId(u.id)}
                        className="flex h-9 w-9 items-center justify-center rounded-[6px] text-ink"
                      >
                        <Icon name="more" size={18} />
                      </button>
                      {menuFor(u, 'desktop')}
                    </>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="flex flex-col">
          {users.map((u) => (
            <div key={u.id} className="relative flex items-center justify-between gap-3 border-b border-border py-4">
              <div className="min-w-0">
                <div className="break-words text-ink">{u.email}</div>
                <div className="mt-1.5 text-[13px] text-muted">
                  {(u.role === 'admin' ? t('admin.roleAdmin') : t('admin.roleUser'))} · {tn('admin.bookCount', u.bookCount)} · {formatBytes(u.bytesUsed, locale)}
                </div>
                {u.disabledAt ? <span className="text-[12px] text-danger">{t('admin.disabled')}</span> : null}
              </div>
              {u.id !== me?.id ? (
                <>
                  <button
                    type="button"
                    aria-label={t('admin.actions', { email: u.email })}
                    onClick={() => setMenuUserId(u.id)}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[6px] border border-control bg-surface text-ink"
                  >
                    <Icon name="more" size={18} />
                  </button>
                  {menuFor(u, 'mobile')}
                </>
              ) : null}
            </div>
          ))}
        </div>
      )}
      {actionError ? (
        <p role="alert" className="text-[13.5px] text-danger">
          {actionError}
        </p>
      ) : null}
      <ResetCodeDialog open={resetCode !== null} code={resetCode ?? ''} onClose={() => setResetCode(null)} />
      <DeleteUserDialog open={deleteTarget !== null} email={deleteTarget?.email ?? ''} onConfirm={handleDeleteConfirmed} onCancel={() => setDeleteTarget(null)} />
      {toast}
    </div>
  );
};
