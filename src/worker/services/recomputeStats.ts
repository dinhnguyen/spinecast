import { localDay, localSecondsIntoDay, localWeekday } from './localTime';
import {
  addDaySeconds,
  currentStreak,
  longestStreak,
  minutesToBase64,
  newDaySeconds,
  newHistory,
  setDayBit,
  toBase64,
} from './statsBitmap';

export const PACE_WINDOW = 250;
export const FINISHED_PCT_Q = 999_000;

// Local seconds-into-day boundaries: night starts the day, then morning,
// afternoon, evening, and night again after 22:00.
const EDGES = [5 * 3600, 12 * 3600, 17 * 3600, 22 * 3600, 86400] as const;

const todBucket = (secOfDay: number): number => {
  if (secOfDay < EDGES[0]) return 3;
  if (secOfDay < EDGES[1]) return 0;
  if (secOfDay < EDGES[2]) return 1;
  if (secOfDay < EDGES[3]) return 2;
  return 3;
};

const nextEdge = (secOfDay: number): number => EDGES.find((e) => e > secOfDay) ?? 86400;

export interface StatsSession {
  book_id: string;
  started_at: number;
  ended_at: number;
  pages: number;
}

export interface BookStatsValues {
  sessions: number;
  seconds: number;
  pages: number;
  completed: number;
  avg_fwd: number;
  pace_n: number;
  tod: number[];
  dow: number[];
  start_date: number;
  finished_date: number;
}

export interface GlobalStatsValues {
  sessions: number;
  seconds: number;
  pages: number;
  completed: number;
  tod: number[];
  dow: number[];
  anchor_day: number;
  history_b64: string;
  minutes_b64: string;
  streak: number;
  current_streak: number;
}

const emptyBook = (): BookStatsValues => ({
  sessions: 0,
  seconds: 0,
  pages: 0,
  completed: 0,
  avg_fwd: 0,
  pace_n: 0,
  tod: [0, 0, 0, 0],
  dow: [0, 0, 0, 0, 0, 0, 0],
  start_date: 0,
  finished_date: 0,
});

const utcMidnight = (epochSec: number): number => Math.floor(epochSec / 86400) * 86400;

const addAt = (arr: number[], i: number, delta: number): void => {
  arr[i] = (arr[i] ?? 0) + delta;
};

export const recomputeStats = (
  sessions: StatsSession[],
  finishedBookIds: Set<string>,
  tz: string,
  now: number,
): { global: GlobalStatsValues; books: Map<string, BookStatsValues> } => {
  const anchorDay = localDay(now, tz);
  const history = newHistory();
  const daySeconds = newDaySeconds();
  const books = new Map<string, BookStatsValues>();
  const global: GlobalStatsValues = {
    sessions: 0,
    seconds: 0,
    pages: 0,
    completed: 0,
    tod: [0, 0, 0, 0],
    dow: [0, 0, 0, 0, 0, 0, 0],
    anchor_day: anchorDay,
    history_b64: '',
    minutes_b64: '',
    streak: 0,
    current_streak: 0,
  };

  for (const s of sessions) {
    const seconds = Math.max(0, s.ended_at - s.started_at);
    let book = books.get(s.book_id);
    if (!book) {
      book = emptyBook();
      books.set(s.book_id, book);
    }
    book.sessions++;
    book.seconds += seconds;
    book.pages += s.pages;
    global.sessions++;
    global.seconds += seconds;
    global.pages += s.pages;

    const day = utcMidnight(s.started_at);
    if (book.start_date === 0 || day < book.start_date) book.start_date = day;

    // Walk the session in segments bounded by the next bucket edge. Local time is
    // re-read every segment, so a DST shift inside the session corrects itself on
    // the following iteration instead of skewing the whole run.
    let t = s.started_at;
    while (t < s.ended_at) {
      const secOfDay = localSecondsIntoDay(t, tz);
      const step = Math.min(s.ended_at - t, nextEdge(secOfDay) - secOfDay);
      if (step <= 0) break;
      const b = todBucket(secOfDay);
      const w = localWeekday(t, tz);
      addAt(book.tod, b, step);
      addAt(book.dow, w, step);
      addAt(global.tod, b, step);
      addAt(global.dow, w, step);
      const dayNo = localDay(t, tz);
      setDayBit(history, anchorDay, dayNo);
      addDaySeconds(daySeconds, anchorDay, dayNo, step);
      t += step;
    }
    // A zero-length session still counts as a reading day.
    if (seconds === 0) setDayBit(history, anchorDay, localDay(s.started_at, tz));
  }

  for (const [bookId, book] of books) {
    if (!finishedBookIds.has(bookId)) continue;
    book.completed = 1;
    global.completed++;
    const last = sessions.filter((s) => s.book_id === bookId).reduce((m, s) => Math.max(m, s.started_at), 0);
    book.finished_date = utcMidnight(last);
  }

  // avg_fwd walks backwards through sessions until PACE_WINDOW turns are covered,
  // taking a pro-rated slice of the session that straddles the cap.
  const byBook = new Map<string, StatsSession[]>();
  for (const s of sessions) {
    const list = byBook.get(s.book_id) ?? [];
    list.push(s);
    byBook.set(s.book_id, list);
  }
  for (const [bookId, list] of byBook) {
    const book = books.get(bookId)!;
    const ordered = [...list].sort((a, b) => b.started_at - a.started_at);
    let turns = 0;
    let secs = 0;
    for (const s of ordered) {
      if (turns >= PACE_WINDOW || s.pages <= 0) continue;
      const take = Math.min(s.pages, PACE_WINDOW - turns);
      secs += Math.max(0, s.ended_at - s.started_at) * (take / s.pages);
      turns += take;
    }
    book.pace_n = turns;
    book.avg_fwd = turns > 0 ? Math.round(secs / turns) : 0;
  }

  global.history_b64 = toBase64(history);
  global.minutes_b64 = minutesToBase64(daySeconds);
  global.streak = longestStreak(history);
  global.current_streak = currentStreak(history);
  return { global, books };
};
