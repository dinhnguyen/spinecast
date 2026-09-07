import type { ReactNode } from 'react';
import { NavLink, Navigate } from 'react-router';
import { AppShell } from '../components/AppShell';
import { SyncBadge } from '../components/SyncBadge';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useSyncSettings } from '../hooks/useSyncSettings';
import { useLocale } from '../i18n/LocaleProvider';
import { useAuth } from '../lib/auth';
import { syncBadgeFor } from '../lib/format';
import { Icon } from '../lib/icons';
import { settingsNavFor, type SettingsSection } from '../lib/settingsNav';
import type { MessageKey } from '../i18n/messages';
import { AccountForm } from './AccountForm';
import { DevicesForm } from './DevicesForm';
import { InvitesForm } from './InvitesForm';
import { OpdsSettingsForm } from './OpdsSettingsForm';
import { PasskeysForm } from './PasskeysForm';
import { SyncSettingsForm } from './SyncSettingsForm';

const TITLE: Record<SettingsSection, MessageKey> = { sync: 'settings.sync', account: 'settings.account', invites: 'settings.invites', opds: 'settings.opds', devices: 'settings.devices', passkeys: 'settings.passkeys' };

const SettingsIndexMobile = ({ rows, t }: { rows: ReturnType<typeof settingsNavFor>; t: (key: MessageKey) => string }) => (
  <div className="flex flex-col px-5 pt-safe-top">
    <h1 className="pb-5 font-serif text-[30px] font-semibold tracking-[-.01em]">{t('settings.title')}</h1>
    <div className="flex flex-col">
      {rows.map((row) => (
        <NavLink key={row.key} to={row.to} className="flex h-11 items-center justify-between border-b border-border text-[15px] text-ink">
          <span>{t(row.labelKey)}</span>
          <Icon name="chev" size={18} className="text-faint" />
        </NavLink>
      ))}
    </div>
  </div>
);

export const SettingsPage = ({ section }: { section?: SettingsSection }) => {
  const { user } = useAuth();
  const { t, locale } = useLocale();
  const { settings, save, test } = useSyncSettings();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const rows = settingsNavFor(user?.role);

  const renderSection = (s: SettingsSection): ReactNode => {
    if (s === 'sync') return <SyncSettingsForm settings={settings} save={save} test={test} />;
    if (s === 'account') return <AccountForm />;
    if (s === 'devices') return <DevicesForm />;
    if (s === 'passkeys') return <PasskeysForm />;
    if (s === 'opds') return <OpdsSettingsForm />;
    return <InvitesForm />;
  };

  if (!section) {
    if (isMobile) {
      return (
        <AppShell syncBadge={<SyncBadge {...syncBadgeFor(settings, locale)} />}>
          <SettingsIndexMobile rows={rows} t={t} />
        </AppShell>
      );
    }
    return <Navigate to="/settings/sync" replace />;
  }

  return (
    <AppShell syncBadge={<SyncBadge {...syncBadgeFor(settings, locale)} />}>
      <div className="flex items-center gap-1.5 border-b border-border bg-surface px-5 pb-3.5 pt-safe-top md:hidden">
        <NavLink to="/settings" aria-label={t('common.back')} className="-ml-3 flex h-11 w-11 items-center justify-center text-ink">
          <Icon name="back" size={22} />
        </NavLink>
        <h1 className="font-serif text-[26px] font-semibold">{t(TITLE[section])}</h1>
      </div>

      <div className="hidden px-10 pt-9 md:block">
        <h1 className="font-serif text-[34px] font-semibold tracking-[-.01em]">{t('settings.title')}</h1>
      </div>

      <div className="flex flex-col gap-5 px-5 pt-[18px] md:flex-row md:gap-12 md:px-10 md:pt-7">
        <div className="hidden w-[240px] flex-col gap-0.5 md:flex">
          {rows.map((n) => (
            <NavLink
              key={n.key}
              to={n.to}
              className={`flex h-10 items-center rounded-md px-3.5 text-[15px] ${
                n.key === section ? 'bg-accent-soft font-semibold text-accent-ink' : 'font-medium text-ink'
              }`}
            >
              {t(n.labelKey)}
            </NavLink>
          ))}
        </div>
        <div className="md:w-[620px]">{renderSection(section)}</div>
      </div>
    </AppShell>
  );
};
