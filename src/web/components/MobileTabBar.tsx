import { useState } from 'react';
import { NavLink, useLocation } from 'react-router';
import { useT } from '../i18n/LocaleProvider';
import type { MessageKey } from '../i18n/messages';
import { Icon, type IconName } from '../lib/icons';
import { UserMenu } from './UserMenu';

const TABS: { to: string; icon: IconName; label: MessageKey }[] = [
  { to: '/', icon: 'library', label: 'nav.library' },
  { to: '/catalogs', icon: 'cloud', label: 'nav.catalogs' },
  { to: '/stats', icon: 'chart', label: 'nav.stats' },
];

const TAB_CLASS = 'flex h-14 flex-1 flex-col items-center justify-center gap-[3px] text-[11.5px]';

export const MobileTabBar = () => {
  const { t } = useT();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const onSettings = pathname.startsWith('/settings');
  return (
    <>
      <nav className="flex border-t border-border bg-surface pb-[max(18px,env(safe-area-inset-bottom))] md:hidden">
        {TABS.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end={tab.to === '/'} className={({ isActive }) => `${TAB_CLASS} ${isActive ? 'font-semibold text-accent' : 'font-medium text-faint'}`}>
            <Icon name={tab.icon} size={22} />
            <span>{t(tab.label)}</span>
          </NavLink>
        ))}
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen(true)}
          className={`${TAB_CLASS} ${onSettings || menuOpen ? 'font-semibold text-accent' : 'font-medium text-faint'}`}
        >
          <Icon name="user" size={22} />
          <span>{t('nav.account')}</span>
        </button>
      </nav>
      <div className="md:hidden">
        <UserMenu open={menuOpen} onClose={() => setMenuOpen(false)} variant="mobile" />
      </div>
    </>
  );
};
