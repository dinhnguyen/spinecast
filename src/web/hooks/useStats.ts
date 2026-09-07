import { useCallback, useEffect, useState } from 'react';
import type { StatsDto } from '../../shared/apiTypes';
import { api } from '../lib/api';

export const useStats = (): { stats: StatsDto | null; loading: boolean; loadError: unknown } => {
  const [stats, setStats] = useState<StatsDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);

  const load = useCallback(async () => {
    try {
      setStats(await api.get<StatsDto>('/api/stats'));
      setLoadError(null);
    } catch (err) {
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return { stats, loading, loadError };
};
