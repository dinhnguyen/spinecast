import { useEffect, useRef } from 'react';
import type { AdminUserDto } from '../../shared/apiTypes';
import { useT } from '../i18n/LocaleProvider';
import { BottomSheet } from './BottomSheet';

interface UserRowMenuProps {
  open: boolean;
  onClose: () => void;
  user: AdminUserDto;
  variant: 'desktop' | 'mobile';
  onChangeRole: () => void;
  onToggleLock: () => void;
  onIssueReset: () => void;
  onDelete: () => void;
}

export const UserRowMenu = ({ open, onClose, user, variant, onChangeRole, onToggleLock, onIssueReset, onDelete }: UserRowMenuProps) => {
  const { t } = useT();
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

  const run = (action: () => void) => () => {
    onClose();
    action();
  };

  const items = (
    <>
      <button type="button" onClick={run(onChangeRole)} className="flex h-10 items-center rounded-[6px] px-2.5 text-left text-[14px] font-medium text-ink">
        {t('admin.changeRole')}
      </button>
      <button type="button" onClick={run(onToggleLock)} className="flex h-10 items-center rounded-[6px] px-2.5 text-left text-[14px] font-medium text-ink">
        {user.disabledAt ? t('admin.unlock') : t('admin.lock')}
      </button>
      <button type="button" onClick={run(onIssueReset)} className="flex h-10 items-center rounded-[6px] px-2.5 text-left text-[14px] font-medium text-ink">
        {t('admin.issueReset')}
      </button>
      <button type="button" onClick={run(onDelete)} className="flex h-10 items-center rounded-[6px] px-2.5 text-left text-[14px] font-medium text-danger">
        {t('admin.delete')}
      </button>
    </>
  );

  if (variant === 'mobile') {
    return (
      <BottomSheet open onClose={onClose} title={user.email} height={224}>
        <div className="flex flex-col">{items}</div>
      </BottomSheet>
    );
  }

  return (
    <div ref={ref} className="absolute right-2 top-11 z-20 flex w-[200px] flex-col rounded-lg border border-border bg-surface p-1.5 shadow-[0_8px_24px_rgba(42,37,31,.16)]">
      {items}
    </div>
  );
};
