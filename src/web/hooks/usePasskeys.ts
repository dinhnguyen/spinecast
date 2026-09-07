import { useCallback, useEffect, useState } from 'react';
import { startRegistration } from '@simplewebauthn/browser';
import type { PasskeyDto } from '../../shared/apiTypes';
import { api } from '../lib/api';

// Derived from the function itself rather than imported, so this does not
// depend on which type names the browser package chooses to re-export.
type CreationOptions = Parameters<typeof startRegistration>[0]['optionsJSON'];

interface UsePasskeysResult {
  passkeys: PasskeyDto[] | null;
  loading: boolean;
  loadError: unknown;
  reload: () => Promise<void>;
  enrol: (password: string) => Promise<PasskeyDto>;
  rename: (id: string, name: string) => Promise<PasskeyDto>;
  remove: (id: string) => Promise<void>;
}

export const usePasskeys = (): UsePasskeysResult => {
  const [passkeys, setPasskeys] = useState<PasskeyDto[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);

  const reload = useCallback(async () => {
    try {
      setPasskeys((await api.get<{ items: PasskeyDto[] }>('/api/passkeys')).items);
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

  const enrol = useCallback(
    async (password: string) => {
      const started = await api.post<{ challengeId: string; options: CreationOptions }>('/api/passkeys/register/options', { password });
      const credential = await startRegistration({ optionsJSON: started.options });
      const created = await api.post<PasskeyDto>('/api/passkeys/register/verify', { challengeId: started.challengeId, credential });
      await reload();
      return created;
    },
    [reload],
  );

  const rename = useCallback(
    async (id: string, name: string) => {
      const updated = await api.patch<PasskeyDto>(`/api/passkeys/${id}`, { name });
      await reload();
      return updated;
    },
    [reload],
  );

  const remove = useCallback(
    async (id: string) => {
      await api.del(`/api/passkeys/${id}`);
      await reload();
    },
    [reload],
  );

  return { passkeys, loading, loadError, reload, enrol, rename, remove };
};
