import { useEffect, useRef } from 'react';
import { NavLink, useNavigate } from 'react-router';
import { useT } from '../i18n/LocaleProvider';
import { useAuth } from '../lib/auth';
import { Icon } from '../lib/icons';
import { settingsNavFor } from '../lib/settingsNav';
import { BottomSheet } from './BottomSheet';

interface UserMenuProps {
  open: boolean;
  onClose: () => void;
  variant: 'desktop' | 'mobile';
}

export const UserMenu = ({ open, onClose, variant }: UserMenuProps) => {
  const { user, logout } = useAuth();
  const { t } = useT();
  const navigate = useNavigate();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || variant !== 'desktop') return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open, variant, onClose]);

  if (!open) return null;

  const rows = settingsNavFor(user?.role);

  const handleLogout = async () => {
    onClose();
    await logout();
    navigate('/login');
  };

  if (variant === 'mobile') {
    return (
      <BottomSheet open onClose={onClose} title={user?.email} height={rows.length * 48 + 152}>
        <div className="flex flex-col">
          {rows.map((row) => (
            <NavLink key={row.key} to={row.to} onClick={onClose} className="flex h-12 items-center justify-between border-b border-border text-[15px] text-ink">
              <span>{t(row.labelKey)}</span>
              <Icon name="chev" size={18} className="text-faint" />
            </NavLink>
          ))}
          <button type="button" onClick={() => void handleLogout()} className="flex h-12 items-center gap-2.5 text-[15px] font-medium text-danger">
            <Icon name="logout" size={18} />
            <span>{t('settings.account.logout')}</span>
          </button>
        </div>
      </BottomSheet>
    );
  }

  return (
    <div ref={ref} className="absolute right-0 top-11 z-30 flex w-[228px] flex-col rounded-lg border border-border bg-surface p-1.5 shadow-[0_8px_24px_rgba(42,37,31,.16)]">
      <span className="truncate px-2.5 pb-1.5 pt-1 text-[13px] text-muted">{user?.email}</span>
      {rows.map((row) => (
        <NavLink
          key={row.key}
          to={row.to}
          onClick={onClose}
          className={({ isActive }) => `flex h-9 items-center rounded-[6px] px-2.5 text-[14px] ${isActive ? 'bg-accent-soft font-semibold text-accent-ink' : 'font-medium text-ink'}`}
        >
          {t(row.labelKey)}
        </NavLink>
      ))}
      <span className="my-1.5 h-px bg-border" />
      <button type="button" onClick={() => void handleLogout()} className="flex h-9 items-center gap-2.5 rounded-[6px] px-2.5 text-[14px] font-medium text-danger">
        <Icon name="logout" size={16} />
        <span>{t('settings.account.logout')}</span>
      </button>
    </div>
  );
};
