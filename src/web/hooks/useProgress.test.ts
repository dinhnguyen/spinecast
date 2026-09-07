import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProgress } from './useProgress';

describe('useProgress', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-05T10:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('stamps observedAt when the position is observed, not when the write flushes', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() => useProgress('book-1'));

    const observedAt = Math.floor(Date.now() / 1000);
    act(() => result.current.save({ pctQ: 1_000, spine: 0 }));
    vi.setSystemTime(new Date('2026-09-05T10:00:30Z'));
    await act(async () => {
      result.current.flush();
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0]![1].body)) as { observedAt: number };
    expect(body.observedAt).toBe(observedAt);
  });
});
