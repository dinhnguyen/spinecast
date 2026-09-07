import { describe, expect, it } from 'vitest';
import {
  addDaySeconds,
  currentStreak,
  getBit,
  HISTORY_BYTES,
  HISTORY_DAYS,
  longestStreak,
  minutesToBase64,
  MINUTES_BYTES,
  newDaySeconds,
  newHistory,
  setDayBit,
  toBase64,
} from './statsBitmap';

const withDays = (anchor: number, days: number[]): Uint8Array => {
  const buf = newHistory();
  for (const d of days) setDayBit(buf, anchor, d);
  return buf;
};

describe('bit layout', () => {
  it('puts the anchor day at bit 0, LSB first', () => {
    const buf = withDays(100, [100]);
    expect(buf[0]).toBe(1);
    expect(getBit(buf, 0)).toBe(true);
  });

  it('puts anchor - 8 at the second byte', () => {
    const buf = withDays(100, [92]);
    expect(buf[0]).toBe(0);
    expect(buf[1]).toBe(1);
  });

  it('ignores days outside the 730-day window', () => {
    const buf = withDays(100, [101, -700]);
    expect(buf.every((b) => b === 0)).toBe(true);
  });

  it('allocates 92 bytes', () => {
    expect(newHistory().length).toBe(HISTORY_BYTES);
  });
});

describe('longestStreak', () => {
  it('finds the longest consecutive run anywhere in the window', () => {
    expect(longestStreak(withDays(100, [100, 99, 97, 96, 95, 94]))).toBe(4);
  });

  it('is 0 for an empty bitmap', () => {
    expect(longestStreak(newHistory())).toBe(0);
  });
});

describe('currentStreak', () => {
  it('counts back from the anchor day when today is set', () => {
    expect(currentStreak(withDays(100, [100, 99, 98]))).toBe(3);
  });

  it('counts back from yesterday when today is not set', () => {
    expect(currentStreak(withDays(100, [99, 98]))).toBe(2);
  });

  it('is 0 when neither today nor yesterday is set', () => {
    expect(currentStreak(withDays(100, [98, 97]))).toBe(0);
  });
});

describe('toBase64', () => {
  it('round-trips through the browser decoder', () => {
    const buf = withDays(100, [100, 92]);
    const back = Uint8Array.from(atob(toBase64(buf)), (ch) => ch.charCodeAt(0));
    expect(Array.from(back)).toEqual(Array.from(buf));
  });
});

const readMinutes = (b64: string, n: number): number => {
  const buf = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return (buf[n * 2] ?? 0) | ((buf[n * 2 + 1] ?? 0) << 8);
};

describe('per-day minutes', () => {
  it('puts the anchor day in slot 0 and rounds seconds to whole minutes', () => {
    const arr = newDaySeconds();
    addDaySeconds(arr, 100, 100, 90);
    addDaySeconds(arr, 100, 98, 3600);
    const b64 = minutesToBase64(arr);
    expect(readMinutes(b64, 0)).toBe(2);
    expect(readMinutes(b64, 1)).toBe(0);
    expect(readMinutes(b64, 2)).toBe(60);
  });

  it('accumulates the segments of a day rather than replacing them', () => {
    const arr = newDaySeconds();
    for (let i = 0; i < 3; i++) addDaySeconds(arr, 100, 100, 600);
    expect(readMinutes(minutesToBase64(arr), 0)).toBe(30);
  });

  it('drops days outside the window and caps a slot at a full day', () => {
    const arr = newDaySeconds();
    addDaySeconds(arr, 100, 101, 3600);
    addDaySeconds(arr, 100, 100 - HISTORY_DAYS, 3600);
    addDaySeconds(arr, 100, 100, 200_000);
    const b64 = minutesToBase64(arr);
    expect(readMinutes(b64, 0)).toBe(1440);
    expect(atob(b64)).toHaveLength(MINUTES_BYTES);
  });
});
