import { useCallback, useEffect, useState } from 'react';
import type { AdminCleanupDto, AdminOverviewDto, AdminRehashDto } from '../../shared/apiTypes';
import { api } from '../lib/api';

interface UseAdminOverviewResult {
  overview: AdminOverviewDto | null;
  loading: boolean;
  error: unknown;
  reload: () => Promise<void>;
  cleanup: () => Promise<AdminCleanupDto>;
  rehash: () => Promise<{ updated: number; missing: number }>;
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

  // The server rehashes one batch per call and hands back a cursor; walk it here
  // so the page sees a single action. A cursor that fails to advance would loop
  // forever, so stop on one that repeats.
  const rehash = useCallback(async () => {
    let cursor: string | null = null;
    let updated = 0;
    let missing = 0;
    for (;;) {
      const path = cursor === null ? '/api/admin/overview/rehash' : `/api/admin/overview/rehash?after=${encodeURIComponent(cursor)}`;
      const res: AdminRehashDto = await api.post<AdminRehashDto>(path);
      updated += res.updated;
      missing += res.missing;
      if (res.cursor === null || res.cursor === cursor) return { updated, missing };
      cursor = res.cursor;
    }
  }, []);

  return { overview, loading, error, reload, cleanup, rehash };
};
