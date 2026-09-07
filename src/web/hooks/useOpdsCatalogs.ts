import { useCallback, useEffect, useState } from 'react';
import type { OpdsCatalogDto } from '../../shared/apiTypes';
import { api } from '../lib/api';

export interface CatalogInput {
  name: string;
  url: string;
  username: string;
  password: string;
}

interface UseOpdsCatalogsResult {
  catalogs: OpdsCatalogDto[] | null;
  loading: boolean;
  loadError: unknown;
  reload: () => Promise<void>;
  create: (input: CatalogInput) => Promise<OpdsCatalogDto>;
  update: (id: string, input: Partial<CatalogInput>) => Promise<OpdsCatalogDto>;
  remove: (id: string) => Promise<void>;
}

export const useOpdsCatalogs = (): UseOpdsCatalogsResult => {
  const [catalogs, setCatalogs] = useState<OpdsCatalogDto[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);

  const reload = useCallback(async () => {
    try {
      setCatalogs((await api.get<{ items: OpdsCatalogDto[] }>('/api/opds/catalogs')).items);
      setLoadError(null);
    } catch (err) {
      // Recorded (not swallowed) so the page can tell "load failed" apart from
      // "you genuinely have no catalogs" - rendering the ordinary empty state on
      // a failed load would invite the user to re-add a source they already have.
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const create = useCallback(
    async (input: CatalogInput) => {
      const created = await api.post<OpdsCatalogDto>('/api/opds/catalogs', input);
      await reload();
      return created;
    },
    [reload],
  );

  const update = useCallback(
    async (id: string, input: Partial<CatalogInput>) => {
      const updated = await api.patch<OpdsCatalogDto>(`/api/opds/catalogs/${id}`, input);
      await reload();
      return updated;
    },
    [reload],
  );

  const remove = useCallback(
    async (id: string) => {
      await api.del(`/api/opds/catalogs/${id}`);
      await reload();
    },
    [reload],
  );

  return { catalogs, loading, loadError, reload, create, update, remove };
};
