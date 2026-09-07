import { useState } from 'react';
import type { DeviceDto } from '../../shared/apiTypes';
import { useLocale } from '../i18n/LocaleProvider';
import { formatRelative } from '../lib/format';
import { Icon } from '../lib/icons';
import { Button } from './Button';
import { Field } from './Field';

interface DeviceRowProps {
  device: DeviceDto;
  busy: boolean;
  onRename: (name: string) => Promise<void>;
  onRemove: () => Promise<void>;
}

export const DeviceRow = ({ device, busy, onRename, onRemove }: DeviceRowProps) => {
  const { t, locale } = useLocale();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(device.name);

  const cancel = (): void => {
    setDraft(device.name);
    setEditing(false);
  };

  const submit = async (): Promise<void> => {
    const name = draft.trim();
    if (!name || name === device.name) return cancel();
    await onRename(name);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="flex items-end gap-2.5 border-b border-border py-3.5">
        <Field
          label={t('settings.devices.name')}
          value={draft}
          maxLength={64}
          onChange={(e) => setDraft(e.target.value)}
          className="flex-1"
        />
        <Button height={40} disabled={busy} onClick={() => void submit()}>
          {t('common.save')}
        </Button>
        <Button kind="ghost" height={40} disabled={busy} onClick={cancel}>
          {t('common.cancel')}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 border-b border-border py-3.5">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-[15px] text-ink">{device.name}</span>
        <span className="text-[12.5px] text-faint">
          {device.current
            ? t('settings.devices.current')
            : t('settings.devices.lastSeen', { when: formatRelative(device.lastSeenAt, locale) })}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button kind="ghost" height={36} disabled={busy} onClick={() => { setDraft(device.name); setEditing(true); }}>
          {t('settings.devices.rename')}
        </Button>
        {device.current ? null : (
          <button
            type="button"
            aria-label={t('settings.devices.remove')}
            disabled={busy}
            onClick={() => void onRemove()}
            className="flex h-9 w-9 items-center justify-center rounded-[6px] border border-control text-muted disabled:opacity-60"
          >
            <Icon name="x" size={16} />
          </button>
        )}
      </div>
    </div>
  );
};
