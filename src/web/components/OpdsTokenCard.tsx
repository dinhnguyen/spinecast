import type { ReactNode } from 'react';
import type { Locale, OpdsScope, OpdsTokenDto } from '../../shared/apiTypes';
import type { Translate } from '../i18n/LocaleProvider';
import { formatDate, formatRelative } from '../lib/format';
import { Icon } from '../lib/icons';
import { Button } from './Button';
import { Field } from './Field';

interface OpdsTokenCardProps {
  scope: OpdsScope;
  title: string;
  description: ReactNode;
  url: string;
  token: OpdsTokenDto | null;
  revealed: string | null;
  shareLink?: string | null;
  busy: boolean;
  t: Translate;
  locale: Locale;
  onCreate: (scope: OpdsScope) => void;
  onReveal: (scope: OpdsScope) => void;
  onRevoke: (scope: OpdsScope) => void;
  onCopy: (text: string) => void;
}

export const OpdsTokenCard = ({ scope, title, description, url, token, revealed, shareLink, busy, t, locale, onCreate, onReveal, onRevoke, onCopy }: OpdsTokenCardProps) => (
  <section className="flex flex-col gap-3.5 rounded-lg border border-border bg-surface p-[18px]">
    <div className="flex flex-col gap-[3px]">
      <h2 className="text-[16px] font-semibold">{title}</h2>
      <p className="text-[13.5px] text-muted">{description}</p>
    </div>
    <div className="flex items-end gap-2">
      <div className="min-w-0 flex-1">
        <Field label={t('settings.opds.urlLabel')} value={url} readOnly mono height={46} className="md:!h-[44px]" />
      </div>
      <button
        type="button"
        aria-label={t('settings.opds.copyUrl')}
        onClick={() => onCopy(url)}
        className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[6px] border border-control bg-surface text-ink md:!h-[44px] md:!w-[44px]"
      >
        <Icon name="copy" size={18} />
      </button>
    </div>
    {revealed ? (
      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between gap-3 rounded-[6px] bg-accent-soft px-3.5 py-3 text-accent-ink">
          <span className="font-mono text-[15px] tracking-[.04em]">{revealed}</span>
          <button type="button" aria-label={t('settings.opds.copyToken')} onClick={() => onCopy(revealed)}>
            <Icon name="copy" size={18} />
          </button>
        </div>
        <span className="text-[12.5px] text-faint">{t('settings.opds.revealNote')}</span>
        {shareLink ? (
          <Button kind="surface" icon="share" height={44} className="md:!h-[40px]" onClick={() => onCopy(shareLink)}>
            {t('settings.opds.copyShareLink')}
          </Button>
        ) : null}
      </div>
    ) : null}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <span className="text-[13px] text-muted">
        {token
          ? token.lastUsedAt
            ? t('settings.opds.statusUsed', { date: formatDate(token.createdAt, locale), when: formatRelative(token.lastUsedAt, locale) })
            : t('settings.opds.statusNeverUsed', { date: formatDate(token.createdAt, locale) })
          : t('settings.opds.noToken')}
      </span>
      {token ? (
        <div className="flex gap-2.5">
          {!revealed && token.revealable ? (
            <Button kind="surface" icon="eye" height={44} className="md:!h-[40px]" disabled={busy} onClick={() => onReveal(scope)}>
              {t('settings.opds.reveal')}
            </Button>
          ) : null}
          <Button kind="surface" icon="sync" height={44} className="md:!h-[40px]" disabled={busy} onClick={() => onCreate(scope)}>
            {t('settings.opds.regenerate')}
          </Button>
          <Button kind="ghost" height={44} className="!text-danger md:!h-[40px]" disabled={busy} onClick={() => onRevoke(scope)}>
            {t('settings.opds.revoke')}
          </Button>
        </div>
      ) : (
        <div className="flex w-full md:w-auto">
          <Button kind="primary" icon="plus" height={44} className="w-full md:!h-[40px] md:w-auto" disabled={busy} onClick={() => onCreate(scope)}>
            {t('settings.opds.create')}
          </Button>
        </div>
      )}
    </div>
  </section>
);
