import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LocaleProvider } from '../i18n/LocaleProvider';
import { dateOfDay, heatDays, heatLevel, heatThresholds, monthLabels, ReadingHeatmap, weekdayOf } from './ReadingHeatmap';

afterEach(cleanup);

// 2026-09-07, a Monday.
const ANCHOR = Math.round((Date.UTC(2026, 8, 7) - Date.UTC(2000, 0, 1)) / 86_400_000);

const b64 = (buf: Uint8Array): string => btoa(String.fromCharCode(...buf));

const history = (daysBack: number[]): string => {
  const buf = new Uint8Array(92);
  for (const n of daysBack) buf[n >> 3] = (buf[n >> 3] ?? 0) | (1 << (n & 7));
  return b64(buf);
};

const minutes = (byDaysBack: Record<number, number>): string => {
  const buf = new Uint8Array(742);
  for (const [n, m] of Object.entries(byDaysBack)) {
    buf[Number(n) * 2] = m & 0xff;
    buf[Number(n) * 2 + 1] = m >> 8;
  }
  return b64(buf);
};

const render12 = (props: { historyB64?: string; minutesB64?: string; anchorDay?: number } = {}) =>
  render(
    <LocaleProvider initial="en">
      <ReadingHeatmap
        historyB64={props.historyB64 ?? ''}
        minutesB64={props.minutesB64 ?? ''}
        anchorDay={props.anchorDay ?? ANCHOR}
      />
    </LocaleProvider>,
  );

describe('weekdayOf', () => {
  it('counts from Monday, with 2000-01-01 as a Saturday', () => {
    expect(weekdayOf(0)).toBe(5);
    expect(weekdayOf(ANCHOR)).toBe(0);
    expect(dateOfDay(ANCHOR).toISOString().slice(0, 10)).toBe('2026-09-07');
  });
});

describe('heatDays', () => {
  it('starts the window on a Monday and ends it on the anchor day', () => {
    const days = heatDays('', '', ANCHOR);
    expect(weekdayOf(days[0]!.day)).toBe(0);
    expect(days.at(-1)!.day).toBe(ANCHOR);
    expect(days).toHaveLength(365);
  });

  it('runs a whole 53 weeks when the anchor is a Sunday', () => {
    const sunday = ANCHOR - 1;
    expect(weekdayOf(sunday)).toBe(6);
    expect(heatDays('', '', sunday)).toHaveLength(371);
  });

  it('reads bit 0 and minute slot 0 as the anchor day', () => {
    const days = heatDays(history([0, 2]), minutes({ 0: 45, 2: 600 }), ANCHOR);
    expect(days.at(-1)).toEqual({ day: ANCHOR, read: true, minutes: 45 });
    expect(days.at(-2)).toEqual({ day: ANCHOR - 1, read: false, minutes: 0 });
    expect(days.at(-3)).toEqual({ day: ANCHOR - 2, read: true, minutes: 600 });
  });

  it('falls back to an empty year on unreadable payloads', () => {
    const days = heatDays('not base64!', 'nope!', ANCHOR);
    expect(days.every((d) => !d.read && d.minutes === 0)).toBe(true);
  });
});

describe('heatLevel', () => {
  const days = heatDays(history([0, 1, 2, 3, 4]), minutes({ 0: 10, 1: 30, 2: 60, 3: 240, 4: 0 }), ANCHOR);
  const thresholds = heatThresholds(days);

  it('buckets the read days by quartile of minutes', () => {
    const level = (n: number) => heatLevel(days.at(-1 - n)!, thresholds);
    expect(level(0)).toBe(1);
    expect(level(1)).toBe(2);
    expect(level(2)).toBe(3);
    expect(level(3)).toBe(4);
  });

  it('keeps a day with no reading at level 0 and a sub-minute day at level 1', () => {
    expect(heatLevel(days.at(-1 - 4)!, thresholds)).toBe(1);
    expect(heatLevel({ day: ANCHOR - 9, read: false, minutes: 0 }, thresholds)).toBe(0);
  });

  it('ignores empty days when picking thresholds, so one marathon does not flatten the year', () => {
    const only = heatDays(history([0]), minutes({ 0: 300 }), ANCHOR);
    expect(heatThresholds(only)).toEqual([300, 300, 300]);
    expect(heatLevel(only.at(-1)!, heatThresholds(only))).toBe(1);
  });
});

describe('monthLabels', () => {
  const first = heatDays('', '', ANCHOR)[0]!.day;

  it('labels every month the window touches, including the stub it ends on', () => {
    // The window runs 2025-09-08 to 2026-09-07: thirteen months, September at both
    // ends. The last one owns a single column - today's - and still gets its label,
    // or today would read as part of August.
    const labels = monthLabels(first);
    expect(labels.map((m) => m.key)).toEqual([
      'stats.month.9', 'stats.month.10', 'stats.month.11', 'stats.month.12',
      'stats.month.1', 'stats.month.2', 'stats.month.3', 'stats.month.4',
      'stats.month.5', 'stats.month.6', 'stats.month.7', 'stats.month.8', 'stats.month.9',
    ]);
    expect(labels.at(-1)!.col).toBe(52);
  });

  it('puts each label on the column its month starts in', () => {
    for (const m of monthLabels(first)) {
      const month = Number(m.key.replace('stats.month.', ''));
      expect(dateOfDay(first + m.col * 7).getUTCMonth() + 1, m.key).toBe(month);
      if (m.col > 0) expect(dateOfDay(first + (m.col - 1) * 7).getUTCMonth() + 1).not.toBe(month);
    }
  });
});

describe('ReadingHeatmap', () => {
  it('sizes the squares off the track instead of scrolling, so a year always fits', () => {
    const { container } = render12();
    expect(container.querySelector('.overflow-x-auto')).toBeNull();
    for (const cell of container.querySelectorAll('.grid-flow-col > span')) {
      expect(cell.className).toContain('aspect-square');
    }
  });

  it('names every square with its date and how long that day was', () => {
    render12({ historyB64: history([0]), minutesB64: minutes({ 0: 45 }) });
    expect(screen.getByLabelText('45 min on Sep 7, 2026')).toBeTruthy();
    expect(screen.getByLabelText('No reading on Sep 6, 2026')).toBeTruthy();
  });

  it('labels the weekdays down the side, every other row', () => {
    const { container } = render12();
    const labels = [...container.querySelectorAll('span')].map((s) => s.textContent);
    expect(labels).toContain('Mon');
    expect(labels).toContain('Fri');
    expect(labels).not.toContain('Tue');
  });

  it('ends the month row on the month the last square belongs to', () => {
    const { container } = render12();
    const row = [...container.querySelectorAll('.grid')].find((el) => el.className.includes('leading-[15px]'))!;
    const labels = [...row.querySelectorAll('span')];
    expect(labels.map((s) => s.textContent)).toEqual(['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep']);
    // Today is 2026-09-07, the only day in the last column: same column as the label.
    expect(labels.at(-1)!.style.gridColumnStart).toBe('53');
    expect(screen.getByLabelText('No reading on Sep 7, 2026').parentElement!.children).toHaveLength(371);
  });

  it('counts the days read and shows the legend', () => {
    render12({ historyB64: history([0, 5, 300]) });
    expect(screen.getByText('3 days read in the last 12 months')).toBeTruthy();
    expect(screen.getByText('Less')).toBeTruthy();
    expect(screen.getByText('More')).toBeTruthy();
  });

  it('pads the anchor week so its column keeps its weekday rows', () => {
    const { container } = render12();
    const grid = container.querySelector('.grid-flow-col')!;
    expect(grid.children).toHaveLength(371);
  });
});
