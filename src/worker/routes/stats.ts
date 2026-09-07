import { Hono } from 'hono';
import type { AppEnv } from '../appEnv';
import type { StatsDto } from '../../shared/apiTypes';
import { listFinishedBookIds, listSessions } from '../db/readingSessions';
import { isGlobalDirty, readGlobalStats, saveStats } from '../db/stats';
import { FINISHED_PCT_Q, recomputeStats, type GlobalStatsValues } from '../services/recomputeStats';
import { currentStreak, HISTORY_BYTES } from '../services/statsBitmap';
import { localDay } from '../services/localTime';
import { findUserById } from '../db/users';
import { requireAuth } from '../middleware/requireAuth';

export const statsRoutes = new Hono<AppEnv>();
statsRoutes.use('*', requireAuth);

const decode = (b64: string): Uint8Array => {
  try {
    return Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
  } catch {
    return new Uint8Array(HISTORY_BYTES);
  }
};

statsRoutes.get('/', async (c) => {
  const userId = c.var.user.id;
  const user = await findUserById(c.env.DB, userId);
  const tz = user?.timezone || 'UTC';
  const now = Math.floor(Date.now() / 1000);

  let global: GlobalStatsValues | null = (await isGlobalDirty(c.env.DB, userId))
    ? null
    : await readGlobalStats(c.env.DB, userId);
  // Bit 0 of the stored bitmap is anchor_day, not today, so a cache anchored to
  // an earlier day would report a frozen streak and a calendar shifted by the gap.
  if (global !== null && global.anchor_day !== localDay(now, tz)) global = null;
  if (global === null) {
    const sessions = await listSessions(c.env.DB, userId);
    const finished = new Set(await listFinishedBookIds(c.env.DB, userId, FINISHED_PCT_Q));
    const out = recomputeStats(sessions, finished, tz, now);
    await saveStats(c.env.DB, userId, out.global, out.books);
    global = out.global;
  }

  const g = global;
  const dto: StatsDto = {
    sessions: g.sessions,
    seconds: g.seconds,
    pages: g.pages,
    completed: g.completed,
    tod: g.tod,
    dow: g.dow,
    anchorDay: g.anchor_day,
    historyB64: g.history_b64,
    minutesB64: g.minutes_b64,
    streak: g.streak,
    // Derived on every read: the current streak changes with the calendar even
    // when nothing new has been written.
    currentStreak: currentStreak(decode(g.history_b64)),
    timezone: tz,
  };
  return c.json(dto);
});
