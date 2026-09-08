import { useCallback, useEffect, useState } from 'react';
import type { AdminUserDto, AdminUserPatch, ResetCodeDto } from '../../shared/apiTypes';
import { api } from '../lib/api';

interface UseAdminUsersResult {
  users: AdminUserDto[];
  loading: boolean;
  error: unknown;
  reload: () => Promise<void>;
  patch: (id: string, input: AdminUserPatch) => Promise<void>;
  remove: (id: string) => Promise<void>;
  issueReset: (id: string) => Promise<ResetCodeDto>;
}

export const useAdminUsers = (): UseAdminUsersResult => {
  const [users, setUsers] = useState<AdminUserDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const reload = useCallback(async () => {
    try {
      const res = await api.get<{ items: AdminUserDto[] }>('/api/admin/users');
      setUsers(res.items);
      setError(null);
    } catch (e) {
      // Recorded so the page can tell "load failed" apart from "no users yet",
      // rendering describeError with a retry button instead of the empty state.
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const patch = useCallback(async (id: string, input: AdminUserPatch) => {
    const updated = await api.patch<AdminUserDto>(`/api/admin/users/${id}`, input);
    setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)));
  }, []);

  const remove = useCallback(async (id: string) => {
    await api.del(`/api/admin/users/${id}`);
    setUsers((prev) => prev.filter((u) => u.id !== id));
  }, []);

  const issueReset = useCallback((id: string): Promise<ResetCodeDto> => api.post<ResetCodeDto>(`/api/admin/users/${id}/reset-code`), []);

  return { users, loading, error, reload, patch, remove, issueReset };
};
