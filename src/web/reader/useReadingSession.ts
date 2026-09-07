import { useCallback, useEffect, useRef } from 'react';
import type { ReadingSessionDto, ReadingSessionInput } from '../../shared/apiTypes';
import { api } from '../lib/api';

export const HEARTBEAT_COALESCE_MS = 10_000;
export const HEARTBEAT_INTERVAL_MS = 30_000;
// Mirrors the server's 300-second idle rule (SESSION_IDLE_SECONDS). Past it the
// server would open a new session anyway, so a tab left visible on an unread
// page must stop reporting rather than accrue wall-clock seconds against nobody.
export const ACTIVITY_WINDOW_MS = 300_000;

export const useReadingSession = (bookId: string): { onForwardTurn: (fraction: number) => void } => {
  const sessionId = useRef<string | null>(null);
  const turns = useRef(0);
  const sent = useRef(0);
  const lastFraction = useRef<number | null>(null);
  const lastTurnAt = useRef(0);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);

  const send = useCallback(async (periodic = false) => {
    if (inFlight.current) return;
    // A periodic heartbeat reports even when nothing turned, so ended_at keeps
    // advancing while someone dwells on one page. Turn-driven and beacon sends
    // have nothing to say when the count has not moved.
    if (!periodic && turns.current === sent.current) return;
    if (sessionId.current === null && turns.current === 0) return;
    inFlight.current = true;
    const payload: ReadingSessionInput = { sessionId: sessionId.current, turns: turns.current };
    try {
      const res = await api.post<ReadingSessionDto>(`/api/books/${bookId}/session`, payload);
      if (payload.sessionId !== null && res.sessionId !== payload.sessionId) {
        // The server rolled to a new row, which starts empty: the count we just
        // sent stays with the previous row, so rebase and carry only the turns
        // since. The turn that triggered the roll lands in neither row. A roll
        // takes a five-minute reading gap, and pages is an activity measure
        // rather than a coverage measure, so one turn is an acceptable loss.
        turns.current -= payload.turns;
        sent.current = 0;
      } else {
        sent.current = payload.turns;
      }
      sessionId.current = res.sessionId;
    } catch {
      // Absolute writes make a lost heartbeat free: the next one carries the
      // correct total, so there is nothing to queue or replay.
    } finally {
      inFlight.current = false;
    }
  }, [bookId]);

  const onForwardTurn = useCallback(
    (fraction: number) => {
      if (!Number.isFinite(fraction)) return;
      const prev = lastFraction.current;
      lastFraction.current = fraction;
      if (prev === null || fraction <= prev) return;
      turns.current++;
      lastTurnAt.current = Date.now();
      // Coalescing defers the send rather than dropping it: a burst of turns
      // schedules one flush, and every turn in the burst rides on it.
      if (flushTimer.current !== null) return;
      flushTimer.current = setTimeout(() => {
        flushTimer.current = null;
        void send();
      }, HEARTBEAT_COALESCE_MS);
    },
    [send],
  );

  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastTurnAt.current > ACTIVITY_WINDOW_MS) return;
      void send(true);
    }, HEARTBEAT_INTERVAL_MS);
    const onHide = () => {
      if (turns.current === sent.current) return;
      const body: ReadingSessionInput = { sessionId: sessionId.current, turns: turns.current };
      navigator.sendBeacon?.(`/api/books/${bookId}/session`, new Blob([JSON.stringify(body)], { type: 'application/json' }));
    };
    window.addEventListener('pagehide', onHide);
    return () => {
      clearInterval(timer);
      if (flushTimer.current !== null) clearTimeout(flushTimer.current);
      window.removeEventListener('pagehide', onHide);
      onHide();
    };
  }, [bookId, send]);

  return { onForwardTurn };
};
