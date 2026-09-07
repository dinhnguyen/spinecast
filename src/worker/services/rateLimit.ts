// KV counters are eventually consistent; good enough to slow brute force, not a hard guarantee.
export const checkRateLimit = async (
  kv: KVNamespace,
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<boolean> => {
  const k = `ratelimit:${key}`;
  const current = Number((await kv.get(k)) ?? '0');
  if (current >= limit) return false;
  await kv.put(k, String(current + 1), { expirationTtl: Math.max(60, windowSeconds) });
  return true;
};
