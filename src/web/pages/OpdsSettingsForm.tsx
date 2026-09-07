import { useState } from 'react';
import type { OpdsScope } from '../../shared/apiTypes';
import { OpdsTokenCard } from '../components/OpdsTokenCard';
import { useOpdsTokens } from '../hooks/useOpdsTokens';
import { useToast } from '../hooks/useToast';
import { useLocale } from '../i18n/LocaleProvider';
import { useAuth } from '../lib/auth';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { describeError } from '../lib/errorMessage';
import { catalogUrl } from '../lib/opds';

export const OpdsSettingsForm = () => {
  const { user } = useAuth();
  const { t, tn, locale } = useLocale();
  const { tokens, loading, loadError, create, revoke } = useOpdsTokens();
  const { toast, show } = useToast();
  const [revealed, setRevealed] = useState<Partial<Record<OpdsScope, string>>>({});
  const [busyScope, setBusyScope] = useState<OpdsScope | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ scope: OpdsScope; kind: 'regenerate' | 'revoke' } | null>(null);

  if (!user) return null;

  const onCreate = async (scope: OpdsScope) => {
    setActionError(null);
    setBusyScope(scope);
    try {
      const created = await create(scope);
      setRevealed((prev) => ({ ...prev, [scope]: created.token }));
    } catch (err) {
      setActionError(describeError(err, t));
    } finally {
      setBusyScope(null);
    }
  };

  const onRevoke = async (scope: OpdsScope) => {
    setActionError(null);
    setBusyScope(scope);
    try {
      await revoke(scope);
      setRevealed((prev) => ({ ...prev, [scope]: undefined }));
    } catch (err) {
      setActionError(describeError(err, t));
    } finally {
      setBusyScope(null);
    }
  };

  const onCopy = async (text: string) => {
    await navigator.clipboard.writeText(text);
    show(t('common.copied'));
  };

  const sharedLine = tn('settings.opds.sharedCount', tokens?.sharedCount ?? 0);

  return (
    <div className="flex flex-col gap-[18px] md:gap-[22px]">
      <p className="text-[14px] leading-normal text-muted md:hidden">{t('settings.opds.introMobile')}</p>
      <p className="hidden text-[14.5px] leading-normal text-muted md:block">{t('settings.opds.introDesktop')}</p>
      {loading ? null : loadError ? (
        // The load failed, so `tokens` is stale/null - render the error in place of the
        // cards instead of alongside them. Rendering the cards here would show the
        // no-token empty state, which a user could mistake for having no tokens and
        // "fix" by clicking Create, silently regenerating (and invalidating) a token
        // their device is actively using.
        <p role="alert" className="text-[13.5px] text-danger">
          {describeError(loadError, t)}
        </p>
      ) : (
        <>
          {actionError ? (
            <p role="alert" className="text-[13.5px] text-danger">
              {actionError}
            </p>
          ) : null}
          <OpdsTokenCard
            scope="library"
            title={t('settings.opds.libraryTitle')}
            description={
              <>
                <span className="md:hidden">{t('settings.opds.libraryDescMobile')}</span>
                <span className="hidden md:inline">{t('settings.opds.libraryDescDesktop')}</span>
              </>
            }
            url={catalogUrl(window.location.origin, user.id, 'library')}
            token={tokens?.library ?? null}
            revealed={revealed.library ?? null}
            busy={busyScope === 'library'}
            t={t}
            locale={locale}
            onCreate={(scope) => (tokens?.[scope] ? setPending({ scope, kind: 'regenerate' }) : void onCreate(scope))}
            onRevoke={(scope) => setPending({ scope, kind: 'revoke' })}
            onCopy={(text) => void onCopy(text)}
          />
          <OpdsTokenCard
            scope="public"
            title={t('settings.opds.publicTitle')}
            description={
              <>
                <span className="md:hidden">{t('settings.opds.publicDescMobile', { sharedLine })}</span>
                <span className="hidden md:inline">{t('settings.opds.publicDescDesktop', { sharedLine })}</span>
              </>
            }
            url={catalogUrl(window.location.origin, user.id, 'public')}
            token={tokens?.public ?? null}
            revealed={revealed.public ?? null}
            shareLink={
              revealed.public
                ? `${window.location.origin}/catalogs?url=${encodeURIComponent(catalogUrl(window.location.origin, user.id, 'public'))}&token=${encodeURIComponent(revealed.public)}`
                : null
            }
            busy={busyScope === 'public'}
            t={t}
            locale={locale}
            onCreate={(scope) => (tokens?.[scope] ? setPending({ scope, kind: 'regenerate' }) : void onCreate(scope))}
            onRevoke={(scope) => setPending({ scope, kind: 'revoke' })}
            onCopy={(text) => void onCopy(text)}
          />
        </>
      )}
      {toast}
      <ConfirmDialog
        open={pending !== null}
        message={t(pending?.kind === 'revoke' ? 'settings.opds.revokeConfirm' : 'settings.opds.regenerateConfirm')}
        confirmLabel={t(pending?.kind === 'revoke' ? 'settings.opds.revoke' : 'settings.opds.regenerate')}
        onConfirm={() => {
          const p = pending;
          setPending(null);
          if (p) void (p.kind === 'revoke' ? onRevoke(p.scope) : onCreate(p.scope));
        }}
        onCancel={() => setPending(null)}
      />
    </div>
  );
};
