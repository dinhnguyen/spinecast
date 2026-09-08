import type { Env } from '../env';
import { randomHex } from './crypto';

const key = (token: string): string => `session:${token}`;

export interface SessionData {
  userId: string;
  deviceId: string | null;
  epoch: number;
}

export const createSession = async (env: Env, userId: string, deviceId: string | null, epoch = 0): Promise<string> => {
  const token = randomHex(32);
  await env.SESSIONS.put(key(token), JSON.stringify({ u: userId, d: deviceId, e: epoch }), {
    expirationTtl: Number(env.SESSION_TTL_SECONDS),
  });
  return token;
};

export const getSession = async (env: Env, token: string): Promise<SessionData | null> => {
  const raw = await env.SESSIONS.get(key(token));
  if (raw === null) return null;
  // Values written before device identity are the bare user id.
  if (!raw.startsWith('{')) return { userId: raw, deviceId: null, epoch: 0 };
  try {
    const o = JSON.parse(raw) as { u?: unknown; d?: unknown; e?: unknown };
    if (typeof o.u !== 'string') return null;
    const epoch = o.e === undefined ? 0 : o.e;
    if (typeof epoch !== 'number' || !Number.isSafeInteger(epoch) || epoch < 0) return null;
    return { userId: o.u, deviceId: typeof o.d === 'string' ? o.d : null, epoch };
  } catch {
    return null;
  }
};

export const deleteSession = (env: Env, token: string): Promise<void> => env.SESSIONS.delete(key(token));
