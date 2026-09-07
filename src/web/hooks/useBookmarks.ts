import { useCallback, useEffect, useState } from 'react';
import type { BookmarkDto, BookmarkSyncResponse, BookmarksDto, CreateBookmarkInput } from '../../shared/apiTypes';
import { api } from '../lib/api';

interface UseBookmarksResult {
  bookmarks: BookmarkDto[];
  loading: boolean;
  loadError: unknown;
  reload: () => Promise<void>;
  sync: () => Promise<string | null>;
  add: (input: CreateBookmarkInput) => Promise<BookmarkDto>;
  remove: (id: string) => Promise<void>;
}

export const useBookmarks = (bookId: string): UseBookmarksResult => {
  const [bookmarks, setBookmarks] = useState<BookmarkDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);

  const reload = useCallback(async () => {
    try {
      setBookmarks((await api.get<BookmarksDto>(`/api/books/${bookId}/bookmarks`)).bookmarks);
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
      const res = await api.post<BookmarkSyncResponse>(`/api/books/${bookId}/bookmarks/sync`);
      setBookmarks(res.bookmarks);
      return res.syncError;
    } catch {
      return 'network';
    }
  }, [bookId]);

  const add = useCallback(
    async (input: CreateBookmarkInput): Promise<BookmarkDto> => {
      const created = await api.post<BookmarkDto>(`/api/books/${bookId}/bookmarks`, input);
      await reload();
      return created;
    },
    [bookId, reload],
  );

  const remove = useCallback(
    async (id: string) => {
      await api.del(`/api/books/${bookId}/bookmarks/${id}`);
      await reload();
    },
    [bookId, reload],
  );

  return { bookmarks, loading, loadError, reload, sync, add, remove };
};
