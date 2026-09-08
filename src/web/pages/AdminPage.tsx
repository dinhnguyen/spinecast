import { NavLink } from 'react-router';
import { AppShell } from '../components/AppShell';
import { SectionShell } from '../components/SectionShell';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useLocale } from '../i18n/LocaleProvider';
import { ADMIN_NAV, type AdminSection } from '../lib/adminNav';
import { Icon } from '../lib/icons';
import { AdminOverview } from './AdminOverview';
import { AdminUsers } from './AdminUsers';
import { InvitesForm } from './InvitesForm';

const AdminIndexMobile = () => {
  const { t } = useLocale();
  return (
    <div className="flex flex-col px-5 pt-safe-top">
      <h1 className="pb-5 font-serif text-[30px] font-semibold tracking-[-.01em]">{t('admin.title')}</h1>
      <div className="flex flex-col">
        {ADMIN_NAV.map((row) => (
          <NavLink key={row.key} to={row.to} className="flex h-11 items-center justify-between border-b border-border text-[15px] text-ink">
            <span>{t(row.labelKey)}</span>
            <Icon name="chev" size={18} className="text-faint" />
          </NavLink>
        ))}
      </div>
    </div>
  );
};

export const AdminPage = ({ section }: { section?: AdminSection }) => {
  const { t } = useLocale();
  const isMobile = useMediaQuery('(max-width: 767px)');
  const active = section ?? 'overview';

  if (!section && isMobile) {
    return (
      <AppShell syncBadge={undefined}>
        <AdminIndexMobile />
        <AdminOverview />
      </AppShell>
    );
  }

  return (
    <SectionShell title={t('admin.title')} backTo="/admin" rows={ADMIN_NAV} active={active}>
      {active === 'users' ? <AdminUsers /> : active === 'invites' ? <InvitesForm /> : <AdminOverview />}
    </SectionShell>
  );
};
