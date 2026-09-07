import { useState } from 'react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DeviceRow } from '../components/DeviceRow';
import { useDevices } from '../hooks/useDevices';
import { useLocale } from '../i18n/LocaleProvider';
import { describeError } from '../lib/errorMessage';

export const DevicesForm = () => {
  const { t } = useLocale();
  const { devices, loading, loadError, rename, remove } = useDevices();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);

  const run = async (id: string, fn: () => Promise<void>): Promise<void> => {
    setActionError(null);
    setBusyId(id);
    try {
      await fn();
    } catch (err) {
      setActionError(describeError(err, t));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col gap-[18px] md:gap-[22px]">
      <p className="text-[14px] leading-normal text-muted md:hidden">{t('settings.devices.introMobile')}</p>
      <p className="hidden text-[14.5px] leading-normal text-muted md:block">{t('settings.devices.introDesktop')}</p>
      {loading ? null : loadError ? (
        <p role="alert" className="text-[13.5px] text-danger">
          {describeError(loadError, t)}
        </p>
      ) : devices.length === 0 ? (
        <p className="text-[14px] text-faint">{t('settings.devices.empty')}</p>
      ) : (
        <div className="flex flex-col">
          {devices.map((d) => (
            <DeviceRow
              key={d.id}
              device={d}
              busy={busyId === d.id}
              onRename={(name) => run(d.id, () => rename(d.id, name))}
              onRemove={() => {
                setPendingRemove(d.id);
                return Promise.resolve();
              }}
            />
          ))}
        </div>
      )}
      {actionError ? (
        <p role="alert" className="text-[13.5px] text-danger">
          {actionError}
        </p>
      ) : null}
      <ConfirmDialog
        open={pendingRemove !== null}
        message={t('settings.devices.removeConfirm')}
        confirmLabel={t('settings.devices.remove')}
        onConfirm={() => {
          const id = pendingRemove;
          setPendingRemove(null);
          if (id) void run(id, () => remove(id));
        }}
        onCancel={() => setPendingRemove(null)}
      />
    </div>
  );
};
