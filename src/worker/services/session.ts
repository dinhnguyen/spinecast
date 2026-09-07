import type { Env } from '../env';
import { randomHex } from './crypto';

const key = (token: string): string => `session:${token}`;

export interface SessionData {
  userId: string;
  deviceId: string | null;
}

export const createSession = async (env: Env, userId: string, deviceId: string | null): Promise<string> => {
  const token = randomHex(32);
  await env.SESSIONS.put(key(token), JSON.stringify({ u: userId, d: deviceId }), {
    expirationTtl: Number(env.SESSION_TTL_SECONDS),
  });
  return token;
};

export const getSession = async (env: Env, token: string): Promise<SessionData | null> => {
  const raw = await env.SESSIONS.get(key(token));
  if (raw === null) return null;
  // Values written before device identity are the bare user id.
  if (!raw.startsWith('{')) return { userId: raw, deviceId: null };
  try {
    const o = JSON.parse(raw) as { u?: unknown; d?: unknown };
    if (typeof o.u !== 'string') return null;
    return { userId: o.u, deviceId: typeof o.d === 'string' ? o.d : null };
  } catch {
    return null;
  }
};

export const deleteSession = (env: Env, token: string): Promise<void> => env.SESSIONS.delete(key(token));
