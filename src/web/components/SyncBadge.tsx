import { Icon } from '../lib/icons';

export type SyncState = 'ok' | 'warn' | 'danger' | 'off';

const STYLE: Record<Exclude<SyncState, 'off'>, { cls: string; icon: 'check' | 'sync' | 'alert' }> = {
  ok: { cls: 'bg-ok-soft text-ok', icon: 'check' },
  warn: { cls: 'bg-warn-soft text-warn', icon: 'sync' },
  danger: { cls: 'bg-danger-soft text-danger', icon: 'alert' },
};

export const SyncBadge = ({ state, text }: { state: SyncState; text: string }) => {
  if (state === 'off') return null;
  const s = STYLE[state];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full py-[5px] pl-2 pr-2.5 text-[12.5px] font-medium ${s.cls}`}>
      <Icon name={s.icon} size={14} />
      <span>{text}</span>
    </span>
  );
};
