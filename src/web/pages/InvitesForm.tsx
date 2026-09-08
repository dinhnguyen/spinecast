import { useState } from 'react';
import { Button } from '../components/Button';
import { useInvites } from '../hooks/useInvites';
import { useToast } from '../hooks/useToast';
import { useLocale } from '../i18n/LocaleProvider';
import { describeError } from '../lib/errorMessage';
import { Icon } from '../lib/icons';

const daysLeft = (expiresAt: number): number => Math.max(0, Math.ceil((expiresAt - Math.floor(Date.now() / 1000)) / 86400));

const isExpired = (expiresAt: number): boolean => expiresAt <= Math.floor(Date.now() / 1000);

export const InvitesForm = () => {
  const { invites, loading, create, revoke } = useInvites();
  const { toast, show } = useToast();
  const { t, tn } = useLocale();
  const [actionError, setActionError] = useState<string | null>(null);

  const handleCopy = async (code: string) => {
    await navigator.clipboard.writeText(code);
    show(t('common.copied'));
  };

  const handleRevoke = async (code: string) => {
    setActionError(null);
    try {
      await revoke(code);
    } catch (e) {
      setActionError(describeError(e, t));
    }
  };

  return (
    <div className="flex flex-col gap-5 md:gap-[22px]">
      <div>
        <Button type="button" icon="plus" onClick={() => void create()}>
          {t('settings.invites.create')}
        </Button>
      </div>
      {loading ? (
        <p>{t('admin.loading')}</p>
      ) : invites.length === 0 ? (
        <p className="text-[14px] text-faint">{t('admin.noInvites')}</p>
      ) : (
        <div className="flex flex-col">
          {invites.map((invite) => (
            <div key={invite.code} className="flex h-[52px] items-center justify-between border-b border-border">
              <span className="font-mono text-[15px] text-ink">{invite.code}</span>
              <div className="flex items-center gap-2">
                <span className={`text-[13.5px] ${invite.usedByEmail || isExpired(invite.expiresAt) ? 'text-faint' : 'text-muted'}`}>
                  {invite.usedByEmail ?? (isExpired(invite.expiresAt) ? t('admin.inviteExpired') : tn('settings.invites.daysLeft', daysLeft(invite.expiresAt)))}
                </span>
                <button
                  type="button"
                  aria-label={t('settings.invites.copy')}
                  onClick={() => void handleCopy(invite.code)}
                  className="flex h-11 w-11 items-center justify-center text-muted"
                >
                  <Icon name="copy" size={18} />
                </button>
                {!invite.usedBy ? (
                  <button
                    type="button"
                    aria-label={t('admin.revokeInvite', { code: invite.code })}
                    onClick={() => void handleRevoke(invite.code)}
                    className="flex h-11 w-11 items-center justify-center text-muted"
                  >
                    <Icon name="x" size={18} />
                  </button>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}
      {actionError ? (
        <p role="alert" className="text-[13.5px] text-danger">
          {actionError}
        </p>
      ) : null}
      {toast}
    </div>
  );
};
