import { useCallback, useEffect, useState } from 'react';
import type { DeviceDto, DevicesDto } from '../../shared/apiTypes';
import { api } from '../lib/api';

interface UseDevicesResult {
  devices: DeviceDto[];
  loading: boolean;
  loadError: unknown;
  reload: () => Promise<void>;
  rename: (id: string, name: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useDevices = (): UseDevicesResult => {
  const [devices, setDevices] = useState<DeviceDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);

  const reload = useCallback(async () => {
    try {
      setDevices((await api.get<DevicesDto>('/api/devices')).devices);
      setLoadError(null);
    } catch (err) {
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const rename = useCallback(
    async (id: string, name: string) => {
      await api.patch<DeviceDto>(`/api/devices/${id}`, { name });
      await reload();
    },
    [reload],
  );

  const remove = useCallback(
    async (id: string) => {
      await api.del(`/api/devices/${id}`);
      await reload();
    },
    [reload],
  );

  return { devices, loading, loadError, reload, rename, remove };
};
