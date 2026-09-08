import { useCallback, useEffect, useState } from 'react';
import type { AdminCleanupDto, AdminOverviewDto } from '../../shared/apiTypes';
import { api } from '../lib/api';

interface UseAdminOverviewResult {
  overview: AdminOverviewDto | null;
  loading: boolean;
  error: unknown;
  reload: () => Promise<void>;
  cleanup: () => Promise<AdminCleanupDto>;
}

export const useAdminOverview = (): UseAdminOverviewResult => {
  const [overview, setOverview] = useState<AdminOverviewDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const reload = useCallback(async () => {
    try {
      const res = await api.get<AdminOverviewDto>('/api/admin/overview');
      setOverview(res);
      setError(null);
    } catch (e) {
      // Recorded so the page can tell "load failed" apart from a genuine 0/0
      // overview, rendering describeError with a retry button instead.
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const cleanup = useCallback((): Promise<AdminCleanupDto> => api.post<AdminCleanupDto>('/api/admin/overview/cleanup'), []);

  return { overview, loading, error, reload, cleanup };
};
