import { useCallback, useEffect, useState } from 'react';
import type { BookDto } from '../../shared/apiTypes';
import { api } from '../lib/api';

export const useBooks = () => {
  const [books, setBooks] = useState<BookDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const reload = useCallback(async () => {
    try {
      const res = await api.get<{ items: BookDto[] }>('/api/books');
      setBooks(res.items);
      setError(null);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const upload = useCallback(async (file: File): Promise<BookDto> => {
    const book = await api.upload<BookDto>('/api/books/upload', file);
    setBooks((prev) => [book, ...prev]);
    return book;
  }, []);

  const remove = useCallback(async (id: string) => {
    await api.del(`/api/books/${id}`);
    setBooks((prev) => prev.filter((b) => b.id !== id));
  }, []);

  const setShared = useCallback(async (id: string, shared: boolean) => {
    const updated = await api.patch<BookDto>(`/api/books/${id}`, { shared });
    setBooks((prev) => prev.map((b) => (b.id === id ? updated : b)));
  }, []);

  return { books, loading, error, reload, upload, remove, setShared };
};
