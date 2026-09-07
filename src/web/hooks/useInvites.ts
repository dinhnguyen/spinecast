import { useCallback, useEffect, useState } from 'react';
import type { InviteDto } from '../../shared/apiTypes';
import { api } from '../lib/api';

export const useInvites = () => {
  const [invites, setInvites] = useState<InviteDto[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      const res = await api.get<{ items: InviteDto[] }>('/api/invites');
      setInvites(res.items);
    } catch {
      // Keep the last known list; a 401 already routes to /login via api.ts.
      // Swallowing here keeps `void reload()` from rejecting unhandled.
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const create = useCallback(async (): Promise<InviteDto> => {
    const invite = await api.post<InviteDto>('/api/invites');
    setInvites((prev) => [invite, ...prev]);
    return invite;
  }, []);

  return { invites, loading, reload, create };
};
