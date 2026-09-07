import { useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router';
import { useT } from '../i18n/LocaleProvider';
import type { MessageKey } from '../i18n/messages';
import { useAuth } from '../lib/auth';
import { Button } from './Button';
import { UserMenu } from './UserMenu';

const LINKS: { to: string; label: MessageKey }[] = [
  { to: '/', label: 'nav.library' },
  { to: '/catalogs', label: 'nav.catalogs' },
  { to: '/stats', label: 'nav.stats' },
];

export const DesktopNav = ({ onUpload, syncBadge }: { onUpload?: () => void; syncBadge: ReactNode }) => {
  const { user } = useAuth();
  const { t } = useT();
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const onSettings = pathname.startsWith('/settings');
  return (
    <header className="hidden h-[60px] items-center justify-between border-b border-border bg-surface px-10 md:flex">
      <div className="flex items-center gap-9">
        <span className="font-serif text-[22px] font-semibold tracking-[-.01em]">Spinecast</span>
        <nav className="flex gap-7">
          {LINKS.map((l) => (
            <NavLink key={l.to} to={l.to} end={l.to === '/'} className={({ isActive }) => `border-b-2 px-0.5 py-1.5 text-[15px] ${isActive ? 'border-accent font-semibold text-ink' : 'border-transparent font-medium text-muted'}`}>
              {t(l.label)}
            </NavLink>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-4">
        {syncBadge}
        {onUpload ? <Button icon="upload" height={38} onClick={onUpload}>{t('nav.upload')}</Button> : null}
        <div className="relative">
          <button
            type="button"
            aria-label={t('nav.account')}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
            className={`flex h-[34px] w-[34px] items-center justify-center rounded-full bg-accent-soft text-[14px] font-semibold text-accent-ink ${onSettings ? 'ring-2 ring-accent ring-offset-2 ring-offset-surface' : ''}`}
          >
            {(user?.email[0] ?? '?').toUpperCase()}
          </button>
          <UserMenu open={menuOpen} onClose={() => setMenuOpen(false)} variant="desktop" />
        </div>
      </div>
    </header>
  );
};
