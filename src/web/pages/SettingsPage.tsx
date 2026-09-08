import type { ReactNode } from 'react';
import { NavLink, Navigate } from 'react-router';
import { AppShell } from '../components/AppShell';
import { SectionShell } from '../components/SectionShell';
import { SyncBadge } from '../components/SyncBadge';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useSyncSettings } from '../hooks/useSyncSettings';
import { useLocale } from '../i18n/LocaleProvider';
import { syncBadgeFor } from '../lib/format';
import { Icon } from '../lib/icons';
import { settingsNav, type SettingsSection } from '../lib/settingsNav';
import type { MessageKey } from '../i18n/messages';
import { AccountForm } from './AccountForm';
import { DevicesForm } from './DevicesForm';
import { OpdsSettingsForm } from './OpdsSettingsForm';
import { PasskeysForm } from './PasskeysForm';
import { SyncSettingsForm } from './SyncSettingsForm';

const SettingsIndexMobile = ({ rows, t }: { rows: ReturnType<typeof settingsNav>; t: (key: MessageKey) => string }) => (
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
  const { t, locale } = useLocale();
  const { settings, save, test } = useSyncSettings();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const rows = settingsNav();

  const renderSection = (s: SettingsSection): ReactNode => {
    if (s === 'sync') return <SyncSettingsForm settings={settings} save={save} test={test} />;
    if (s === 'account') return <AccountForm />;
    if (s === 'devices') return <DevicesForm />;
    if (s === 'passkeys') return <PasskeysForm />;
    return <OpdsSettingsForm />;
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
    <SectionShell title={t('settings.title')} backTo="/settings" rows={rows} active={section} syncBadge={<SyncBadge {...syncBadgeFor(settings, locale)} />}>
      {renderSection(section)}
    </SectionShell>
  );
};
