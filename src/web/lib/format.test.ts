import { describe, expect, it } from 'vitest';
import { formatBytes, formatClock, formatDate, formatMinutes, formatRelative, syncBadgeFor } from './format';

const now = Date.UTC(2026, 8, 4, 7, 2) / 1000;

describe('formatRelative', () => {
  it('formats recent times in vietnamese', () => {
    expect(formatRelative(now - 20, 'vi', now)).toBe('vừa xong');
    expect(formatRelative(now - 120, 'vi', now)).toBe('2 phút trước');
    expect(formatRelative(now - 3 * 3600, 'vi', now)).toMatch(/^hôm nay \d{2}:\d{2}$/);
    expect(formatRelative(now - 2 * 86400, 'vi', now)).toBe('2 ngày trước');
  });

  it('formats recent times in english with plurals', () => {
    expect(formatRelative(now - 20, 'en', now)).toBe('just now');
    expect(formatRelative(now - 60, 'en', now)).toBe('1 minute ago');
    expect(formatRelative(now - 120, 'en', now)).toBe('2 minutes ago');
    expect(formatRelative(now - 3 * 3600, 'en', now)).toMatch(/^today \d{2}:\d{2}$/);
    expect(formatRelative(now - 86400, 'en', now)).toBe('1 day ago');
  });
});

describe('formatClock', () => {
  it('uses a 24 hour clock in both locales', () => {
    expect(formatClock(now, 'vi')).toMatch(/^\d{2}:\d{2}$/);
    expect(formatClock(now, 'en')).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe('formatDate', () => {
  it('formats a day/month/year date with no time, per locale', () => {
    expect(formatDate(now, 'vi')).toMatch(/^\d{2}\/\d{2}\/2026$/);
    expect(formatDate(now, 'en')).toMatch(/^\d{2}\/\d{2}\/2026$/);
  });
});

describe('syncBadgeFor', () => {
  const base = { enabled: true, serverUrl: 'x', username: 'u', hasCredentials: true, hashMethod: 'partial' as const };

  it('maps settings to badge states', () => {
    expect(syncBadgeFor(null, 'vi')).toEqual({ state: 'off', text: '' });
    expect(syncBadgeFor({ ...base, enabled: false, hasCredentials: false, lastOkAt: null, lastError: null }, 'vi')).toEqual({ state: 'off', text: '' });
    expect(syncBadgeFor({ ...base, lastOkAt: now - 120, lastError: null }, 'vi', now).text).toBe('Đã đồng bộ · 2 phút trước');
    expect(syncBadgeFor({ ...base, lastOkAt: now - 120, lastError: null }, 'en', now).text).toBe('Synced · 2 minutes ago');
    expect(syncBadgeFor({ ...base, lastOkAt: null, lastError: 'unauthorized: x' }, 'en').text).toBe('Sync login rejected');
    expect(syncBadgeFor({ ...base, lastOkAt: null, lastError: 'network: down' }, 'vi').state).toBe('warn');
    expect(syncBadgeFor({ ...base, lastOkAt: null, lastError: null }, 'en')).toEqual({ state: 'warn', text: 'Not synced' });
  });
});

describe('formatBytes', () => {
  it('formats bytes, KB, MB with one decimal per locale', () => {
    expect(formatBytes(0, 'vi')).toBe('0 B');
    expect(formatBytes(1536, 'en')).toBe('1.5 KB');
    expect(formatBytes(36_000_000, 'vi')).toBe('34,3 MB');
  });

  it('promotes to the next unit when rounding a just-under-boundary value up to 1024', () => {
    expect(formatBytes(Math.round(1024 * 1023.97), 'en')).toBe('1 MB');
  });
});

describe('formatMinutes', () => {
  it('drops the seconds the calendar does not store', () => {
    expect(formatMinutes(45, 'en')).toBe('45 min');
    expect(formatMinutes(0, 'en')).toBe('0 min');
    expect(formatMinutes(90, 'en')).toBe('1h 30m');
  });
});
