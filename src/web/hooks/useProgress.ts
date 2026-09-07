import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProgressResponse, PutProgressResponse } from '../../shared/apiTypes';
import type { Position } from '../../shared/position';
import { api } from '../lib/api';

const stamped = (pos: Position): Position => ({ ...pos, observedAt: Math.floor(Date.now() / 1000) });

export const useProgress = (bookId: string) => {
  const [lastResult, setLastResult] = useState<PutProgressResponse | null>(null);
  const pending = useRef<Position | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => api.get<ProgressResponse>(`/api/books/${bookId}/progress`), [bookId]);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const pos = pending.current;
    if (!pos) return;
    pending.current = null;
    api
      .put<PutProgressResponse>(`/api/books/${bookId}/progress`, pos)
      .then(setLastResult)
      .catch(() =>
        setLastResult({ local: { ...pos, updatedAt: 0, lastPushedAt: null, deviceId: null, observedAt: pos.observedAt ?? null }, pushed: false, syncError: 'network' }),
      );
  }, [bookId]);

  const save = useCallback(
    (pos: Position) => {
      pending.current = stamped(pos);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, 2000);
    },
    [flush],
  );

  const beacon = useCallback(
    (pos: Position) => {
      navigator.sendBeacon(`/api/books/${bookId}/progress`, new Blob([JSON.stringify(stamped(pos))], { type: 'application/json' }));
    },
    [bookId],
  );

  useEffect(() => () => flush(), [flush]);
  return { load, save, flush, beacon, lastResult };
};
