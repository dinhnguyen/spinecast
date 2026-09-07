import { useT } from '../i18n/LocaleProvider';
import type { MessageKey } from '../i18n/messages';
import { formatMinutes } from '../lib/format';

export interface HeatDay {
  day: number;
  read: boolean;
  minutes: number;
}

const WEEKS = 53;

// The squares shrink to fit the track rather than scrolling out of it - a year has
// to be visible on a phone. They stop growing at 11px, which is what each cap is:
// 53 squares plus 52 gaps of the width that breakpoint uses (1px, 2px, then 3px).
const TRACK_CAPS = 'max-w-[635px] sm:max-w-[687px] lg:max-w-[739px]';

// The worker numbers days from 2000-01-01 (EPOCH_DAY_2000) and a day number is a
// local calendar day, so it has to be read back in UTC to name the same date.
const DAY_ZERO_UTC = Date.UTC(2000, 0, 1);

export const dateOfDay = (day: number): Date => new Date(DAY_ZERO_UTC + day * 86_400_000);

// 2000-01-01 was a Saturday, index 5 in a week that starts on Monday.
export const weekdayOf = (day: number): number => (((day + 5) % 7) + 7) % 7;

const decode = (b64: string, bytes: number): Uint8Array => {
  try {
    return Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  } catch {
    return new Uint8Array(bytes);
  }
};

// The window ends on the anchor day's own column and starts 53 Mondays back, so
// every column is a whole week and the rows really are weekdays.
export const heatDays = (historyB64: string, minutesB64: string, anchorDay: number): HeatDay[] => {
  const history = decode(historyB64, 92);
  const minutes = decode(minutesB64, WEEKS * 7 * 2);
  const out: HeatDay[] = [];
  for (let n = 364 + weekdayOf(anchorDay); n >= 0; n--) {
    out.push({
      day: anchorDay - n,
      read: ((history[n >> 3] ?? 0) & (1 << (n & 7))) !== 0,
      minutes: (minutes[n * 2] ?? 0) | ((minutes[n * 2 + 1] ?? 0) << 8),
    });
  }
  return out;
};

// Quartiles of the days that have minutes on them, so one marathon does not
// flatten a year of ordinary evenings.
export const heatThresholds = (days: HeatDay[]): [number, number, number] => {
  const sorted = days.map((d) => d.minutes).filter((m) => m > 0).sort((a, b) => a - b);
  const at = (q: number): number => sorted[Math.ceil(sorted.length * q) - 1] ?? 0;
  return [at(0.25), at(0.5), at(0.75)];
};

export const heatLevel = (d: HeatDay, [q1, q2, q3]: [number, number, number]): number => {
  if (!d.read && d.minutes === 0) return 0;
  if (d.minutes > q3) return 4;
  if (d.minutes > q2) return 3;
  if (d.minutes > q1) return 2;
  return 1;
};

// Only Mon, Wed and Fri get a label, the way a year-wide grid has room for.
const WEEKDAY_KEYS = ['stats.dow.mon', 'stats.dow.tue', 'stats.dow.wed', 'stats.dow.thu', 'stats.dow.fri'] as const;

// Spelled out so Tailwind's scanner sees every class it has to emit.
const HEAT = ['bg-heat-0', 'bg-heat-1', 'bg-heat-2', 'bg-heat-3', 'bg-heat-4'] as const;

const COLUMNS = `repeat(${WEEKS}, minmax(0, 1fr))`;

export interface MonthLabel {
  col: number;
  key: MessageKey;
}

// Every month the window touches gets a label, at the column its first Monday
// falls in. Skipping one - the last month has as little as a single column to
// itself - would leave the days after it reading as part of the month before.
// That is what keeps the labels compact ('T9', 'Sep') rather than spelled out.
export const monthLabels = (firstDay: number): MonthLabel[] => {
  const out: MonthLabel[] = [];
  let previous = -1;
  for (let col = 0; col < WEEKS; col++) {
    const month = dateOfDay(firstDay + col * 7).getUTCMonth();
    if (month !== previous) out.push({ col, key: `stats.month.${month + 1}` as MessageKey });
    previous = month;
  }
  return out;
};

export const ReadingHeatmap = ({
  historyB64,
  minutesB64,
  anchorDay,
}: {
  historyB64: string;
  minutesB64: string;
  anchorDay: number;
}) => {
  const { t, tn, locale } = useT();
  const days = heatDays(historyB64, minutesB64, anchorDay);
  const thresholds = heatThresholds(days);
  const firstDay = days[0]?.day ?? anchorDay;
  const readDays = days.filter((d) => d.read).length;
  const dateFmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

  const cellLabel = (d: HeatDay): string => {
    const date = dateFmt.format(dateOfDay(d.day));
    if (d.minutes > 0) return t('stats.calendarRead', { date, duration: formatMinutes(d.minutes, locale) });
    return d.read ? t('stats.calendarUnder', { date }) : t('stats.calendarNone', { date });
  };

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-stretch gap-1.5">
        {/* Below lg the squares are a few pixels wide and a 10px label cannot line up
            with a row that small, so the weekdays wait for the room to say them. The
            padding skips the month row, leaving seven equal rows over the squares -
            and the line-height has to match a square, because Tailwind pairs an
            arbitrary text size with a 1.5 line-height that would space the rows out
            wider than the grid they label. */}
        <div className="hidden shrink-0 grid-rows-7 items-center justify-items-end gap-[3px] pt-[15px] text-[10px] leading-[11px] text-faint lg:grid">
          {[0, 1, 2, 3, 4, 5, 6].map((row) => (
            <span key={row}>{row % 2 === 0 && row < 5 ? t(WEEKDAY_KEYS[row]!) : ''}</span>
          ))}
        </div>
        <div className={`min-w-0 flex-1 ${TRACK_CAPS}`}>
          {/* Same gap as the squares below, so a label starts exactly where its
              column does instead of drifting left across the year. */}
          <div
            className="grid gap-px text-[10px] leading-[15px] text-faint sm:gap-[2px] lg:gap-[3px]"
            style={{ gridTemplateColumns: COLUMNS }}
          >
            {monthLabels(firstDay).map((m) => (
              <span key={m.col} className="whitespace-nowrap" style={{ gridColumnStart: m.col + 1 }}>
                {t(m.key)}
              </span>
            ))}
          </div>
          <div
            className="grid grid-flow-col gap-px sm:gap-[2px] lg:gap-[3px]"
            style={{ gridTemplateColumns: COLUMNS, gridTemplateRows: 'repeat(7, minmax(0, 1fr))' }}
          >
            {days.map((d) => {
              const label = cellLabel(d);
              return (
                <span
                  key={d.day}
                  role="img"
                  aria-label={label}
                  title={label}
                  className={`aspect-square rounded-[1px] lg:rounded-[2px] ${HEAT[heatLevel(d, thresholds)]}`}
                />
              );
            })}
            {/* Pads the anchor day's week out to seven, so its column keeps its weekday rows. */}
            {Array.from({ length: 6 - weekdayOf(anchorDay) }, (_, i) => (
              <span key={`pad-${i}`} className="aspect-square" />
            ))}
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-faint">
        <span>{tn('stats.calendarDays', readDays)}</span>
        <span className="flex items-center gap-1.5">
          <span>{t('stats.heatLess')}</span>
          <span className="flex gap-[3px]">
            {HEAT.map((cls) => (
              <span key={cls} className={`h-[11px] w-[11px] rounded-[2px] ${cls}`} />
            ))}
          </span>
          <span>{t('stats.heatMore')}</span>
        </span>
      </div>
    </div>
  );
};
