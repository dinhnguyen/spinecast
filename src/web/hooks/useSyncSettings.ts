import { useCallback, useEffect, useState } from 'react';
import type { SyncSettingsDto, SyncSettingsInput } from '../../shared/apiTypes';
import { api } from '../lib/api';

interface UseSyncSettingsResult {
  settings: SyncSettingsDto | null;
  loading: boolean;
  reload: () => Promise<void>;
  save: (input: SyncSettingsInput) => Promise<SyncSettingsDto>;
  test: () => Promise<void>;
}

export const useSyncSettings = (): UseSyncSettingsResult => {
  const [settings, setSettings] = useState<SyncSettingsDto | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setSettings(await api.get<SyncSettingsDto>('/api/sync/settings'));
    } catch {
      // Keep the last known settings; a 401 already routes to /login via api.ts.
      // Swallowing here keeps `void reload()` from rejecting unhandled.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const save = useCallback(async (input: SyncSettingsInput): Promise<SyncSettingsDto> => {
    const dto = await api.put<SyncSettingsDto>('/api/sync/settings', input);
    setSettings(dto);
    return dto;
  }, []);

  const test = useCallback(async () => {
    await api.post('/api/sync/test');
    await reload();
  }, [reload]);

  return { settings, loading, reload, save, test };
};
