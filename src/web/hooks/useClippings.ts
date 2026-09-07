import { useCallback, useEffect, useState } from 'react';
import type {
  ClippingDto,
  ClippingSyncResponse,
  ClippingsDto,
  CreateClippingInput,
  UpdateClippingInput,
} from '../../shared/apiTypes';
import { api } from '../lib/api';

interface UseClippingsResult {
  clippings: ClippingDto[];
  loading: boolean;
  loadError: unknown;
  reload: () => Promise<void>;
  sync: () => Promise<string | null>;
  add: (input: CreateClippingInput) => Promise<ClippingDto>;
  update: (id: string, input: UpdateClippingInput) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export const useClippings = (bookId: string): UseClippingsResult => {
  const [clippings, setClippings] = useState<ClippingDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);

  const reload = useCallback(async () => {
    try {
      setClippings((await api.get<ClippingsDto>(`/api/books/${bookId}/clippings`)).clippings);
      setLoadError(null);
    } catch (err) {
      setLoadError(err);
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Returns the sync error rather than throwing it: a sync server that is down
  // must not stop the reader, and the caller decides whether to surface it.
  const sync = useCallback(async (): Promise<string | null> => {
    try {
      const res = await api.post<ClippingSyncResponse>(`/api/books/${bookId}/clippings/sync`);
      setClippings(res.clippings);
      return res.syncError;
    } catch {
      return 'network';
    }
  }, [bookId]);

  const add = useCallback(
    async (input: CreateClippingInput): Promise<ClippingDto> => {
      const created = await api.post<ClippingDto>(`/api/books/${bookId}/clippings`, input);
      await reload();
      return created;
    },
    [bookId, reload],
  );

  const update = useCallback(
    async (id: string, input: UpdateClippingInput) => {
      await api.patch<ClippingDto>(`/api/books/${bookId}/clippings/${id}`, input);
      await reload();
    },
    [bookId, reload],
  );

  const remove = useCallback(
    async (id: string) => {
      await api.del(`/api/books/${bookId}/clippings/${id}`);
      await reload();
    },
    [bookId, reload],
  );

  return { clippings, loading, loadError, reload, sync, add, update, remove };
};
