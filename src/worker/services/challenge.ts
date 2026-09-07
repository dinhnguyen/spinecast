import { randomHex } from './crypto';

export const CHALLENGE_TTL_SECONDS = 300;

const key = (id: string): string => `wachal:${id}`;

export const putChallenge = async (kv: KVNamespace, challenge: string): Promise<string> => {
  const id = randomHex(16);
  await kv.put(key(id), challenge, { expirationTtl: Math.max(60, CHALLENGE_TTL_SECONDS) });
  return id;
};

// Reading deletes: a challenge is good for exactly one ceremony, so the same
// assertion cannot be replayed.
export const takeChallenge = async (kv: KVNamespace, challengeId: string): Promise<string | null> => {
  const value = await kv.get(key(challengeId));
  if (value === null) return null;
  await kv.delete(key(challengeId));
  return value;
};
