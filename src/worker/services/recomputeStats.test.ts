import { describe, expect, it } from 'vitest';
import { recomputeStats, type StatsSession } from './recomputeStats';
import { currentStreak, getBit } from './statsBitmap';
import { localDay } from './localTime';

const UTC = 'UTC';
const NONE = new Set<string>();
const at = (iso: string): number => Math.floor(Date.parse(iso) / 1000);
const s = (from: string, to: string, pages = 10, book = 'b1'): StatsSession => ({
  book_id: book,
  started_at: at(from),
  ended_at: at(to),
  pages,
});
const bits = (b64: string): Uint8Array => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
const dayMinutes = (b64: string, n: number): number => {
  const buf = bits(b64);
  return (buf[n * 2] ?? 0) | ((buf[n * 2 + 1] ?? 0) << 8);
};

describe('bucket splitting', () => {
  it('splits an evening session across evening and night', () => {
    const { global } = recomputeStats([s('2026-09-06T21:00:00Z', '2026-09-06T23:00:00Z')], NONE, UTC, at('2026-09-06T23:00:00Z'));
    expect(global.tod).toEqual([0, 0, 3600, 3600]);
    expect(global.seconds).toBe(7200);
  });

  it('splits a session that crosses midnight across two weekdays and two days', () => {
    // 2026-09-06 is a Sunday (index 6), 2026-09-07 a Monday (index 0).
    const now = at('2026-09-07T01:00:00Z');
    const { global } = recomputeStats([s('2026-09-06T23:30:00Z', '2026-09-07T00:30:00Z')], NONE, UTC, now);
    expect(global.dow[6]).toBe(1800);
    expect(global.dow[0]).toBe(1800);
    const anchor = localDay(now, UTC);
    const h = bits(global.history_b64);
    expect(getBit(h, anchor - localDay(at('2026-09-06T23:30:00Z'), UTC))).toBe(true);
    expect(getBit(h, anchor - localDay(at('2026-09-07T00:30:00Z'), UTC))).toBe(true);
  });

  it('does not break a streak when a session crosses midnight', () => {
    const now = at('2026-09-07T01:00:00Z');
    const { global } = recomputeStats([s('2026-09-06T23:30:00Z', '2026-09-07T00:30:00Z')], NONE, UTC, now);
    expect(currentStreak(bits(global.history_b64))).toBe(2);
  });

  it('puts a morning session entirely in the morning bucket', () => {
    const { global } = recomputeStats([s('2026-09-06T06:00:00Z', '2026-09-06T07:00:00Z')], NONE, UTC, at('2026-09-06T08:00:00Z'));
    expect(global.tod).toEqual([3600, 0, 0, 0]);
  });
});

describe('timezone', () => {
  it('splits a session at a local bucket edge on a 23-hour day', () => {
    // Europe/Berlin springs forward at 2026-03-29T01:00:00Z, so this session runs
    // 04:30 to 05:30 local and straddles the 05:00 morning edge. The same instants
    // in UTC are 02:30 to 03:30, entirely inside night.
    const now = at('2026-03-29T08:00:00Z');
    const { global } = recomputeStats([s('2026-03-29T02:30:00Z', '2026-03-29T03:30:00Z')], NONE, 'Europe/Berlin', now);
    expect(global.seconds).toBe(3600);
    expect(global.tod).toEqual([1800, 0, 0, 1800]);
  });

  it('buckets by the user zone rather than UTC', () => {
    // 19:00Z on a Sunday is 02:00 on Monday in Asia/Ho_Chi_Minh: a different
    // bucket, a different weekday, and a different local day.
    const now = at('2026-09-07T05:00:00Z');
    const { global } = recomputeStats([s('2026-09-06T19:00:00Z', '2026-09-06T20:00:00Z')], NONE, 'Asia/Ho_Chi_Minh', now);
    expect(global.tod).toEqual([0, 0, 0, 3600]);
    expect(global.dow[0]).toBe(3600);
    expect(global.dow[6]).toBe(0);
    expect(getBit(bits(global.history_b64), 0)).toBe(true);
    expect(getBit(bits(global.history_b64), 1)).toBe(false);
  });
});

describe('pace', () => {
  it('averages seconds per turn over at most 250 turns, newest first', () => {
    const sessions = [
      s('2026-09-01T10:00:00Z', '2026-09-01T10:33:20Z', 400), // 2000s / 400 turns
      s('2026-09-02T10:00:00Z', '2026-09-02T10:10:00Z', 50), // 600s / 50 turns
    ];
    const { books } = recomputeStats(sessions, NONE, UTC, at('2026-09-02T11:00:00Z'));
    const b = books.get('b1')!;
    // Newest session gives all 50 turns for 600s; the older one contributes 200 more
    // turns, pro-rated to 1000s, to reach the cap: (600 + 1000) / 250 = 6.4 -> 6.
    expect(b.pace_n).toBe(250);
    expect(b.avg_fwd).toBe(6);
  });

  it('reports the real turn count when under the cap', () => {
    const { books } = recomputeStats([s('2026-09-01T10:00:00Z', '2026-09-01T10:10:00Z', 60)], NONE, UTC, at('2026-09-01T11:00:00Z'));
    expect(books.get('b1')!.pace_n).toBe(60);
    expect(books.get('b1')!.avg_fwd).toBe(10);
  });
});

describe('completion', () => {
  it('counts finished books globally and marks the book row', () => {
    const sessions = [s('2026-09-01T10:00:00Z', '2026-09-01T10:10:00Z', 10, 'b1'), s('2026-09-01T11:00:00Z', '2026-09-01T11:10:00Z', 10, 'b2')];
    const { global, books } = recomputeStats(sessions, new Set(['b1']), UTC, at('2026-09-01T12:00:00Z'));
    expect(global.completed).toBe(1);
    expect(books.get('b1')!.completed).toBe(1);
    expect(books.get('b2')!.completed).toBe(0);
  });
});

describe('empty input', () => {
  it('returns zeroed values without throwing', () => {
    const { global, books } = recomputeStats([], NONE, UTC, at('2026-09-06T00:00:00Z'));
    expect(global.sessions).toBe(0);
    expect(global.seconds).toBe(0);
    expect(global.streak).toBe(0);
    expect(global.current_streak).toBe(0);
    expect(global.tod).toEqual([0, 0, 0, 0]);
    expect(books.size).toBe(0);
  });
});

describe('dates', () => {
  it('records the first and last session days as UTC midnights', () => {
    const sessions = [s('2026-09-03T10:00:00Z', '2026-09-03T10:10:00Z'), s('2026-09-01T10:00:00Z', '2026-09-01T10:10:00Z')];
    const { books } = recomputeStats(sessions, new Set(['b1']), UTC, at('2026-09-04T00:00:00Z'));
    expect(books.get('b1')!.start_date).toBe(at('2026-09-01T00:00:00Z'));
    expect(books.get('b1')!.finished_date).toBe(at('2026-09-03T00:00:00Z'));
  });

  it('leaves finished_date at 0 for an unfinished book', () => {
    const { books } = recomputeStats([s('2026-09-03T10:00:00Z', '2026-09-03T10:10:00Z')], NONE, UTC, at('2026-09-04T00:00:00Z'));
    expect(books.get('b1')!.finished_date).toBe(0);
  });
});

describe('per-day minutes', () => {
  it('records how long each day was, split at midnight like the buckets are', () => {
    const now = at('2026-09-07T01:00:00Z');
    const { global } = recomputeStats([s('2026-09-06T23:30:00Z', '2026-09-07T00:30:00Z')], NONE, UTC, now);
    expect(dayMinutes(global.minutes_b64, 0)).toBe(30);
    expect(dayMinutes(global.minutes_b64, 1)).toBe(30);
  });

  it('sums every session on the same day', () => {
    const now = at('2026-09-07T22:00:00Z');
    const sessions = [s('2026-09-07T08:00:00Z', '2026-09-07T08:45:00Z'), s('2026-09-07T20:00:00Z', '2026-09-07T20:15:00Z')];
    const { global } = recomputeStats(sessions, NONE, UTC, now);
    expect(dayMinutes(global.minutes_b64, 0)).toBe(60);
  });

  it('leaves a zero-length session as a read day with no minutes', () => {
    const now = at('2026-09-07T22:00:00Z');
    const { global } = recomputeStats([s('2026-09-07T08:00:00Z', '2026-09-07T08:00:00Z')], NONE, UTC, now);
    expect(getBit(bits(global.history_b64), 0)).toBe(true);
    expect(dayMinutes(global.minutes_b64, 0)).toBe(0);
  });
});
