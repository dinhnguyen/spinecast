export const HISTORY_BYTES = 92;
export const HISTORY_DAYS = 730;

export const newHistory = (): Uint8Array => new Uint8Array(HISTORY_BYTES);

export const getBit = (buf: Uint8Array, n: number): boolean => ((buf[n >> 3] ?? 0) & (1 << (n & 7))) !== 0;

export const setDayBit = (buf: Uint8Array, anchorDay: number, day: number): void => {
  const n = anchorDay - day;
  if (n < 0 || n >= HISTORY_DAYS) return;
  buf[n >> 3] = (buf[n >> 3] ?? 0) | (1 << (n & 7));
};

export const longestStreak = (buf: Uint8Array): number => {
  let longest = 0;
  let run = 0;
  for (let n = 0; n < HISTORY_DAYS; n++) {
    if (getBit(buf, n)) {
      run++;
      if (run > longest) longest = run;
    } else {
      run = 0;
    }
  }
  return longest;
};

// Mirrors crosspoint-sync's currentStreak: not having read today does not break
// the streak, it just starts the count at yesterday.
export const currentStreak = (buf: Uint8Array): number => {
  let streak = 0;
  let n = getBit(buf, 0) ? 0 : 1;
  while (n < HISTORY_DAYS && getBit(buf, n)) {
    streak++;
    n++;
  }
  return streak;
};

export const toBase64 = (buf: Uint8Array): string => {
  let s = '';
  for (const b of buf) s += String.fromCharCode(b);
  return btoa(s);
};

export const MINUTES_BYTES = HISTORY_DAYS * 2;

export const newDaySeconds = (): Uint32Array => new Uint32Array(HISTORY_DAYS);

export const addDaySeconds = (arr: Uint32Array, anchorDay: number, day: number, seconds: number): void => {
  const n = anchorDay - day;
  if (n < 0 || n >= HISTORY_DAYS) return;
  arr[n] = (arr[n] ?? 0) + seconds;
};

// One little-endian uint16 of minutes per day, indexed like the bitmap: slot 0 is
// the anchor day. Capped at a full day, so sessions that overlap each other or a
// clock that jumps backwards cannot overflow the slot.
export const minutesToBase64 = (daySeconds: Uint32Array): string => {
  const buf = new Uint8Array(MINUTES_BYTES);
  for (let n = 0; n < HISTORY_DAYS; n++) {
    const m = Math.min(1440, Math.round((daySeconds[n] ?? 0) / 60));
    buf[n * 2] = m & 0xff;
    buf[n * 2 + 1] = m >> 8;
  }
  return toBase64(buf);
};
