import { Button } from '../components/Button';
import { useInvites } from '../hooks/useInvites';
import { useToast } from '../hooks/useToast';
import { useLocale } from '../i18n/LocaleProvider';
import { Icon } from '../lib/icons';

const daysLeft = (expiresAt: number): number => Math.max(0, Math.ceil((expiresAt - Math.floor(Date.now() / 1000)) / 86400));

export const InvitesForm = () => {
  const { invites, create } = useInvites();
  const { toast, show } = useToast();
  const { t, tn } = useLocale();

  const handleCopy = async (code: string) => {
    await navigator.clipboard.writeText(code);
    show(t('common.copied'));
  };

  return (
    <div className="flex flex-col gap-5 md:gap-[22px]">
      <div>
        <Button type="button" icon="plus" onClick={() => void create()}>
          {t('settings.invites.create')}
        </Button>
      </div>
      <div className="flex flex-col">
        {invites.map((invite) => (
          <div key={invite.code} className="flex h-[52px] items-center justify-between border-b border-border">
            <span className="font-mono text-[15px] text-ink">{invite.code}</span>
            <div className="flex items-center gap-2">
              <span className={`text-[13.5px] ${invite.usedBy ? 'text-faint' : 'text-muted'}`}>
                {invite.usedBy ? t('settings.invites.used') : tn('settings.invites.daysLeft', daysLeft(invite.expiresAt))}
              </span>
              <button
                type="button"
                aria-label={t('settings.invites.copy')}
                onClick={() => void handleCopy(invite.code)}
                className="flex h-11 w-11 items-center justify-center text-muted"
              >
                <Icon name="copy" size={18} />
              </button>
            </div>
          </div>
        ))}
      </div>
      {toast}
    </div>
  );
};
