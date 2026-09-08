import type { ReactNode } from 'react';
import { NavLink } from 'react-router';
import { useLocale } from '../i18n/LocaleProvider';
import { Icon } from '../lib/icons';
import type { MessageKey } from '../i18n/messages';
import { AppShell } from './AppShell';

interface SectionShellProps {
  title: string;
  backTo: string;
  rows: { key: string; labelKey: MessageKey; to: string }[];
  active?: string;
  children: ReactNode;
  syncBadge?: ReactNode;
}

export const SectionShell = ({ title, backTo, rows, active, children, syncBadge }: SectionShellProps) => {
  const { t } = useLocale();
  const activeRow = rows.find((n) => n.key === active);

  return (
    <AppShell syncBadge={syncBadge}>
      <div className="flex items-center gap-1.5 border-b border-border bg-surface px-5 pb-3.5 pt-safe-top md:hidden">
        <NavLink to={backTo} aria-label={t('common.back')} className="-ml-3 flex h-11 w-11 items-center justify-center text-ink">
          <Icon name="back" size={22} />
        </NavLink>
        <h1 className="font-serif text-[26px] font-semibold">{activeRow ? t(activeRow.labelKey) : title}</h1>
      </div>

      <div className="hidden px-10 pt-9 md:block">
        <h1 className="font-serif text-[34px] font-semibold tracking-[-.01em]">{title}</h1>
      </div>

      <div className="flex flex-col gap-5 px-5 pt-[18px] md:flex-row md:gap-12 md:px-10 md:pt-7">
        <div className="hidden w-[240px] flex-col gap-0.5 md:flex">
          {rows.map((n) => (
            <NavLink
              key={n.key}
              to={n.to}
              className={`flex h-10 items-center rounded-md px-3.5 text-[15px] ${
                n.key === active ? 'bg-accent-soft font-semibold text-accent-ink' : 'font-medium text-ink'
              }`}
            >
              {t(n.labelKey)}
            </NavLink>
          ))}
        </div>
        <div className="md:w-[620px]">{children}</div>
      </div>
    </AppShell>
  );
};
