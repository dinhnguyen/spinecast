import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ACTIVITY_WINDOW_MS, HEARTBEAT_COALESCE_MS, HEARTBEAT_INTERVAL_MS, useReadingSession } from './useReadingSession';
import { api } from '../lib/api';

const posts = () => (api.post as unknown as ReturnType<typeof vi.fn>).mock.calls;

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(api, 'post').mockResolvedValue({ sessionId: 'sess-1' });
});

afterEach(() => {
  // Several of the tests below leave a hook mounted with pending timers or
  // unsent turns; without this, its listeners and refs would leak into the
  // next test (this file has no global afterEach(cleanup), so it is not automatic).
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useReadingSession', () => {
  it('does not treat the first relocate as a turn', () => {
    const { result } = renderHook(() => useReadingSession('b1'));
    act(() => result.current.onForwardTurn(0.1));
    act(() => vi.advanceTimersByTime(HEARTBEAT_COALESCE_MS + 1));
    expect(posts()).toHaveLength(0);
  });

  it('counts only forward movement', async () => {
    const { result } = renderHook(() => useReadingSession('b1'));
    act(() => result.current.onForwardTurn(0.1));
    act(() => result.current.onForwardTurn(0.2));
    act(() => result.current.onForwardTurn(0.15));
    act(() => result.current.onForwardTurn(0.3));
    await act(async () => {
      vi.advanceTimersByTime(HEARTBEAT_COALESCE_MS + 1);
    });
    expect(posts()[0]![1]).toEqual({ sessionId: null, turns: 2 });
  });

  it('coalesces bursts into one request', async () => {
    const { result } = renderHook(() => useReadingSession('b1'));
    act(() => result.current.onForwardTurn(0.1));
    for (const f of [0.2, 0.3, 0.4, 0.5]) act(() => result.current.onForwardTurn(f));
    await act(async () => {
      vi.advanceTimersByTime(HEARTBEAT_COALESCE_MS + 1);
    });
    expect(posts()).toHaveLength(1);
    expect(posts()[0]![1]).toEqual({ sessionId: null, turns: 4 });
  });

  it('sends the session id it was given back', async () => {
    const { result } = renderHook(() => useReadingSession('b1'));
    act(() => result.current.onForwardTurn(0.1));
    act(() => result.current.onForwardTurn(0.2));
    await act(async () => {
      vi.advanceTimersByTime(HEARTBEAT_COALESCE_MS + 1);
    });
    act(() => result.current.onForwardTurn(0.3));
    await act(async () => {
      vi.advanceTimersByTime(HEARTBEAT_COALESCE_MS + 1);
    });
    expect(posts()[1]![1]).toEqual({ sessionId: 'sess-1', turns: 2 });
  });

  it('keeps its count when a request fails', async () => {
    (api.post as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useReadingSession('b1'));
    act(() => result.current.onForwardTurn(0.1));
    act(() => result.current.onForwardTurn(0.2));
    await act(async () => {
      vi.advanceTimersByTime(HEARTBEAT_COALESCE_MS + 1);
    });
    act(() => result.current.onForwardTurn(0.3));
    await act(async () => {
      vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS + 1);
    });
    expect(posts()[1]![1]).toEqual({ sessionId: null, turns: 2 });
  });

  it('does not send an idle heartbeat before any turn', async () => {
    renderHook(() => useReadingSession('b1'));
    await act(async () => {
      vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS * 3);
    });
    expect(posts()).toHaveLength(0);
  });
});

describe('useReadingSession rate limit', () => {
  it('does not post more than once per 10 seconds even when turns land at different times', async () => {
    const { result } = renderHook(() => useReadingSession('b1'));
    act(() => result.current.onForwardTurn(0.1)); // t=0, seed
    act(() => result.current.onForwardTurn(0.2)); // t=0, turn 1, flush scheduled for t=10000
    await act(async () => {
      vi.advanceTimersByTime(5000); // t=5000
    });
    act(() => result.current.onForwardTurn(0.3)); // t=5000, turn 2, flush already pending: no new timer
    await act(async () => {
      vi.advanceTimersByTime(5001); // t=10001, the t=10000 flush fires
    });
    expect(posts()).toHaveLength(1);
    expect(posts()[0]![1]).toEqual({ sessionId: null, turns: 2 });

    await act(async () => {
      vi.advanceTimersByTime(1999); // t=12000
    });
    act(() => result.current.onForwardTurn(0.4)); // t=12000, turn 3, flush scheduled for t=22000
    await act(async () => {
      vi.advanceTimersByTime(4000); // t=16000: next flush not due until t=22000
    });
    expect(posts()).toHaveLength(1);
  });
});

describe('useReadingSession failed heartbeat retry', () => {
  it('retries a failed send on the next periodic heartbeat, with the same cumulative total', async () => {
    (api.post as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('offline'));
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    const { result } = renderHook(() => useReadingSession('b1'));
    act(() => result.current.onForwardTurn(0.1)); // seed
    act(() => result.current.onForwardTurn(0.2)); // turn 1
    act(() => result.current.onForwardTurn(0.3)); // turn 2, flush scheduled
    await act(async () => {
      vi.advanceTimersByTime(HEARTBEAT_COALESCE_MS + 1); // flush fires and rejects
    });
    expect(posts()).toHaveLength(1);
    expect(posts()[0]![1]).toEqual({ sessionId: null, turns: 2 });

    // No further turns. Only the periodic heartbeat is left to retry.
    await act(async () => {
      vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS + 1);
    });
    expect(posts()).toHaveLength(2);
    expect(posts()[1]![1]).toEqual({ sessionId: null, turns: 2 });
  });
});

describe('useReadingSession periodic heartbeat', () => {
  it('reports while visible even when no page has turned since the last send', async () => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    const { result } = renderHook(() => useReadingSession('b1'));
    act(() => result.current.onForwardTurn(0.1)); // seed
    act(() => result.current.onForwardTurn(0.2)); // turn 1
    await act(async () => {
      vi.advanceTimersByTime(HEARTBEAT_COALESCE_MS + 1);
    });
    expect(posts()).toHaveLength(1);

    // No further turns. ended_at only advances if this heartbeat still goes out.
    await act(async () => {
      vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS + 1);
    });
    expect(posts()).toHaveLength(2);
    expect(posts()[1]![1]).toEqual({ sessionId: 'sess-1', turns: 1 });
  });

  it('goes quiet once the last turn is older than the activity window', async () => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    const { result } = renderHook(() => useReadingSession('b1'));
    act(() => result.current.onForwardTurn(0.1)); // seed
    act(() => result.current.onForwardTurn(0.2)); // turn 1

    // Traffic inside the window is expected; what matters is that it stops, so
    // the server's idle rule can close a session nobody is reading.
    await act(async () => {
      vi.advanceTimersByTime(ACTIVITY_WINDOW_MS);
    });
    const settled = posts().length;
    // Five separate intervals, each with its own microtask flush, so a request
    // still in flight cannot be what silences them.
    for (let i = 0; i < 5; i++) {
      await act(async () => {
        vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);
      });
    }
    expect(posts()).toHaveLength(settled);
  });

  it('still reports an unchanged turn count while the last turn is inside the window', async () => {
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    const { result } = renderHook(() => useReadingSession('b1'));
    act(() => result.current.onForwardTurn(0.1)); // seed
    act(() => result.current.onForwardTurn(0.2)); // turn 1
    await act(async () => {
      vi.advanceTimersByTime(ACTIVITY_WINDOW_MS - HEARTBEAT_INTERVAL_MS);
    });
    const before = posts().length;
    // The heartbeat on the far edge of the window still goes out: a slow reader
    // dwelling on one page is reading, and ended_at has to follow them.
    await act(async () => {
      vi.advanceTimersByTime(HEARTBEAT_INTERVAL_MS);
    });
    expect(posts().length).toBeGreaterThan(before);
    expect(posts().at(-1)![1]).toEqual({ sessionId: 'sess-1', turns: 1 });
  });
});

describe('useReadingSession session roll', () => {
  it('counts from zero again when the server answers with a different session id', async () => {
    const post = api.post as unknown as ReturnType<typeof vi.fn>;
    const { result } = renderHook(() => useReadingSession('b1'));
    act(() => result.current.onForwardTurn(0)); // seed
    for (let i = 1; i <= 50; i++) act(() => result.current.onForwardTurn(i / 100));
    await act(async () => {
      vi.advanceTimersByTime(HEARTBEAT_COALESCE_MS + 1);
    });
    expect(posts()[0]![1]).toEqual({ sessionId: null, turns: 50 });

    // The next flush comes back with a new id: the server rolled, and the 50
    // turns it just acknowledged belong to the previous row.
    post.mockResolvedValue({ sessionId: 'sess-2' });
    act(() => result.current.onForwardTurn(0.55));
    await act(async () => {
      vi.advanceTimersByTime(HEARTBEAT_COALESCE_MS + 1);
    });
    expect(posts()[1]![1]).toEqual({ sessionId: 'sess-1', turns: 51 });

    act(() => result.current.onForwardTurn(0.56));
    act(() => result.current.onForwardTurn(0.57));
    await act(async () => {
      vi.advanceTimersByTime(HEARTBEAT_COALESCE_MS + 1);
    });
    expect(posts()[2]![1]).toEqual({ sessionId: 'sess-2', turns: 2 });
  });
});

describe('useReadingSession pagehide beacon', () => {
  afterEach(() => {
    delete (navigator as { sendBeacon?: unknown }).sendBeacon;
  });

  it('sends a beacon with the cumulative total on pagehide when a turn is unsent', async () => {
    const sendBeacon = vi.fn().mockReturnValue(true);
    (navigator as unknown as { sendBeacon: typeof sendBeacon }).sendBeacon = sendBeacon;

    const { result } = renderHook(() => useReadingSession('b1'));
    act(() => result.current.onForwardTurn(0.1)); // seed
    act(() => result.current.onForwardTurn(0.2)); // turn 1, unsent
    act(() => window.dispatchEvent(new Event('pagehide')));

    expect(sendBeacon).toHaveBeenCalledTimes(1);
    const [url, body] = sendBeacon.mock.calls[0]!;
    expect(url).toBe('/api/books/b1/session');
    const text = await (body as Blob).text();
    expect(JSON.parse(text)).toEqual({ sessionId: null, turns: 1 });
  });

  it('does not send a beacon on pagehide when nothing is unsent', () => {
    const sendBeacon = vi.fn().mockReturnValue(true);
    (navigator as unknown as { sendBeacon: typeof sendBeacon }).sendBeacon = sendBeacon;

    renderHook(() => useReadingSession('b1'));
    // No turns at all, so nothing is pending: pagehide must not send anything.
    act(() => window.dispatchEvent(new Event('pagehide')));
    expect(sendBeacon).not.toHaveBeenCalled();
  });
});
