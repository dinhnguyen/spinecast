import type { Locale, SyncSettingsDto } from '../../shared/apiTypes';
import type { SyncState } from '../components/SyncBadge';
import { translate, translatePlural } from '../i18n/messages';

export const formatClock = (ts: number, locale: Locale): string =>
  new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(ts * 1000));

export const formatDate = (ts: number, locale: Locale): string =>
  new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(ts * 1000));

export const formatRelative = (ts: number, locale: Locale, now = Math.floor(Date.now() / 1000)): string => {
  const diff = Math.max(0, now - ts);
  if (diff < 60) return translate(locale, 'time.justNow');
  if (diff < 3600) return translatePlural(locale, 'time.minutesAgo', Math.floor(diff / 60));
  const d = new Date(ts * 1000);
  const n = new Date(now * 1000);
  const time = formatClock(ts, locale);
  if (d.toDateString() === n.toDateString()) return translate(locale, 'time.todayAt', { time });
  const days = Math.floor(diff / 86400);
  if (days < 1) return translate(locale, 'time.yesterdayAt', { time });
  return translatePlural(locale, 'time.daysAgo', days);
};

export const formatPercent = (pctQ: number): string => `${Math.round(pctQ / 10_000)}%`;

export const formatNumber = (n: number, locale: Locale): string => new Intl.NumberFormat(locale).format(n);

export const formatBytes = (n: number, locale: Locale): string => {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = n / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  // The bucket above picks a unit off the raw value, but rounding to one decimal
  // can then push a value like 1023.97 up to 1024 - display that in the next
  // unit up (1.0 MB) rather than as "1,024.0 KB".
  let rounded = Math.round(value * 10) / 10;
  if (rounded >= 1024 && unit < units.length - 1) {
    unit++;
    rounded = Math.round((rounded / 1024) * 10) / 10;
  }
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(rounded)} ${units[unit]}`;
};

export const formatDuration = (totalSeconds: number, locale: Locale): string => {
  const s = Math.max(0, Math.round(totalSeconds));
  const hours = Math.floor(s / 3600);
  const minutes = Math.floor((s % 3600) / 60);
  const seconds = s % 60;
  if (hours > 0) return translate(locale, 'stats.durationHm', { hours, minutes });
  if (minutes > 0) return translate(locale, 'stats.durationMs', { minutes, seconds });
  return translate(locale, 'stats.durationS', { seconds });
};

// The reading calendar stores whole minutes, so the seconds formatDuration would
// print are noise there.
export const formatMinutes = (minutes: number, locale: Locale): string => {
  const m = Math.max(0, Math.round(minutes));
  if (m >= 60) return translate(locale, 'stats.durationHm', { hours: Math.floor(m / 60), minutes: m % 60 });
  return translate(locale, 'stats.durationM', { minutes: m });
};

export const syncBadgeFor = (s: SyncSettingsDto | null, locale: Locale, now?: number): { state: SyncState; text: string } => {
  if (!s || !s.enabled || !s.hasCredentials) return { state: 'off', text: '' };
  if (s.lastError?.startsWith('unauthorized')) return { state: 'danger', text: translate(locale, 'sync.badgeUnauthorized') };
  if (s.lastError) return { state: 'warn', text: translate(locale, 'sync.badgePending') };
  if (s.lastOkAt) return { state: 'ok', text: translate(locale, 'sync.badgeSynced', { when: formatRelative(s.lastOkAt, locale, now) }) };
  return { state: 'warn', text: translate(locale, 'sync.badgePending') };
};

export const syncErrorMessageFor = (lastError: string, locale: Locale): string => {
  const kind = lastError.split(':')[0] ?? lastError;
  if (kind === 'unauthorized') return translate(locale, 'sync.badgeUnauthorized');
  if (kind === 'network') return translate(locale, 'errors.network');
  return translate(locale, 'errors.sync', { kind });
};
