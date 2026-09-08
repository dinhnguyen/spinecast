import { useCallback, useEffect, useState } from 'react';
import type { OpdsScope, OpdsTokenCreatedDto, OpdsTokensDto } from '../../shared/apiTypes';
import { api } from '../lib/api';

interface UseOpdsTokensResult {
  tokens: OpdsTokensDto | null;
  loading: boolean;
  loadError: unknown;
  reload: () => Promise<void>;
  create: (scope: OpdsScope) => Promise<OpdsTokenCreatedDto>;
  reveal: (scope: OpdsScope) => Promise<OpdsTokenCreatedDto>;
  revoke: (scope: OpdsScope) => Promise<void>;
}

export const useOpdsTokens = (): UseOpdsTokensResult => {
  const [tokens, setTokens] = useState<OpdsTokensDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);

  const reload = useCallback(async () => {
    try {
      setTokens(await api.get<OpdsTokensDto>('/api/opds/tokens'));
      setLoadError(null);
    } catch (err) {
      // Recorded (not swallowed) so the form can tell "load failed" apart from
      // "you genuinely have no tokens" - rendering the ordinary empty state on
      // a failed load would invite the user to hit Create, which regenerates
      // and invalidates the token their device is actually using.
      // A 401 already routes to /login via api.ts regardless.
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const create = useCallback(
    async (scope: OpdsScope): Promise<OpdsTokenCreatedDto> => {
      const created = await api.post<OpdsTokenCreatedDto>(`/api/opds/tokens/${scope}`);
      await reload();
      return created;
    },
    [reload],
  );

  const reveal = useCallback((scope: OpdsScope): Promise<OpdsTokenCreatedDto> => api.get<OpdsTokenCreatedDto>(`/api/opds/tokens/${scope}/reveal`), []);

  const revoke = useCallback(
    async (scope: OpdsScope) => {
      await api.del(`/api/opds/tokens/${scope}`);
      await reload();
    },
    [reload],
  );

  return { tokens, loading, loadError, reload, create, reveal, revoke };
};
