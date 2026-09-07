export const EPOCH_DAY_2000 = 10957;

const WEEKDAYS: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

export const isValidTimeZone = (tz: string): boolean => {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

const parts = (epochSec: number, tz: string): Record<string, string> => {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    weekday: 'short',
  });
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(new Date(epochSec * 1000))) out[p.type] = p.value;
  return out;
};

export const localDay = (epochSec: number, tz: string): number => {
  const p = parts(epochSec, tz);
  const utcMidnight = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)) / 1000;
  return Math.floor(utcMidnight / 86400) - EPOCH_DAY_2000;
};

export const localSecondsIntoDay = (epochSec: number, tz: string): number => {
  const p = parts(epochSec, tz);
  return Number(p.hour) * 3600 + Number(p.minute) * 60 + Number(p.second);
};

export const localWeekday = (epochSec: number, tz: string): number => {
  const weekday = parts(epochSec, tz).weekday;
  if (!weekday) {
    throw new Error('Intl.DateTimeFormat did not provide weekday');
  }
  return WEEKDAYS[weekday] ?? 0;
};
