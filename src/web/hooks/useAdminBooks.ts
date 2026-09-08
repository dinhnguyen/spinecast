import { useCallback, useEffect, useState } from 'react';
import type { AdminBookDto, AdminBooksPageDto, AdminBookSort } from '../../shared/apiTypes';
import { api } from '../lib/api';

export const useAdminBooks = (sort: AdminBookSort) => {
  const [items, setItems] = useState<AdminBookDto[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [version, setVersion] = useState(0);
  const fetchPage = useCallback(async (after: string | null) => {
    const query = new URLSearchParams({ sort });
    if (after) query.set('cursor', after);
    return api.get<AdminBooksPageDto>(`/api/admin/books?${query.toString()}`);
  }, [sort]);
  useEffect(() => {
    let alive = true;
    setLoading(true); setItems([]); setCursor(null);
    fetchPage(null).then((page) => { if (alive) { setItems(page.items); setCursor(page.nextCursor); setError(null); } })
      .catch((caught: unknown) => { if (alive) setError(caught); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [fetchPage, version]);
  const loadMore = useCallback(async () => {
    if (!cursor) return;
    try {
      const page = await fetchPage(cursor);
      setItems((previous) => [...previous, ...page.items]);
      setCursor(page.nextCursor);
      setError(null);
    } catch (caught: unknown) {
      setError(caught);
    }
  }, [cursor, fetchPage]);
  return { items, loading, error, hasMore: cursor !== null, loadMore, reload: () => setVersion((value) => value + 1) };
};
