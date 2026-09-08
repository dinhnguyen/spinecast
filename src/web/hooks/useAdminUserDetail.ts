import { useCallback, useEffect, useState } from 'react';
import type { AdminUserDetailDto } from '../../shared/apiTypes';
import { api } from '../lib/api';

export const useAdminUserDetail = (id: string) => {
  const [detail, setDetail] = useState<AdminUserDetailDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const reload = useCallback(async () => {
    setLoading(true);
    try { setDetail(await api.get<AdminUserDetailDto>(`/api/admin/users/${id}`)); setError(null); }
    catch (caught) { setError(caught); }
    finally { setLoading(false); }
  }, [id]);
  useEffect(() => { void reload(); }, [reload]);
  const revokeDevice = useCallback(async (deviceId: string) => {
    await api.del(`/api/admin/users/${id}/devices/${deviceId}`);
    setDetail((value) => value && { ...value, devices: value.devices.filter((device) => device.id !== deviceId) });
  }, [id]);
  const removePasskey = useCallback(async (passkeyId: string) => {
    await api.del(`/api/admin/users/${id}/passkeys/${passkeyId}`);
    setDetail((value) => value && { ...value, passkeys: value.passkeys.filter((passkey) => passkey.id !== passkeyId), passkeyCount: value.passkeyCount - 1 });
  }, [id]);
  return { detail, loading, error, reload, revokeDevice, removePasskey };
};
