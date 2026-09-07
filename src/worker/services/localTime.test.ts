import { describe, expect, it } from 'vitest';
import { isValidTimeZone, localDay, localSecondsIntoDay, localWeekday } from './localTime';

const HCM = 'Asia/Ho_Chi_Minh';
const BERLIN = 'Europe/Berlin';

describe('isValidTimeZone', () => {
  it('accepts real zones', () => {
    expect(isValidTimeZone(HCM)).toBe(true);
    expect(isValidTimeZone('UTC')).toBe(true);
  });

  it('rejects junk', () => {
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });
});

describe('localDay', () => {
  it('counts days since 2000-01-01 in the zone', () => {
    // 2000-01-01T00:00:00Z is day 0 in UTC.
    expect(localDay(946684800, 'UTC')).toBe(0);
    // 2026-09-06T00:00:00Z
    expect(localDay(1788652800, 'UTC')).toBe(9745);
  });

  it('rolls the date forward east of UTC', () => {
    // 2026-09-05T18:00:00Z is 2026-09-06 01:00 in Ho Chi Minh.
    expect(localDay(1788631200, HCM)).toBe(localDay(1788631200, 'UTC') + 1);
  });
});

describe('localSecondsIntoDay', () => {
  it('applies the standard offset', () => {
    // 2026-09-06T00:30:00Z is 07:30 in Ho Chi Minh.
    expect(localSecondsIntoDay(1788654600, HCM)).toBe(7 * 3600 + 30 * 60);
  });

  it('follows DST, not a fixed offset', () => {
    // 2026-06-24T12:00:00Z is 14:00 CEST; 2026-01-01T12:00:00Z is 13:00 CET.
    expect(localSecondsIntoDay(1782302400, BERLIN)).toBe(14 * 3600);
    expect(localSecondsIntoDay(1767268800, BERLIN)).toBe(13 * 3600);
  });

  it('returns 0 for exact local midnight', () => {
    // 2026-09-05T17:00:00Z is 2026-09-06T00:00:00 in Ho Chi Minh (UTC+7).
    // Guards the assumption that Intl renders midnight as hour "00", not "24".
    // If a future runtime uses h24 format and renders midnight as "24", this test will fail.
    expect(localSecondsIntoDay(1788627600, HCM)).toBe(0);
  });
});

describe('localWeekday', () => {
  it('returns 0 for Monday and 6 for Sunday', () => {
    // 2026-09-06 is a Sunday, 2026-09-07 a Monday.
    expect(localWeekday(1788652800, 'UTC')).toBe(6);
    expect(localWeekday(1788739200, 'UTC')).toBe(0);
  });
});
