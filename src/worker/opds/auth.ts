import { createMiddleware } from 'hono/factory';
import type { OpdsScope } from '../../shared/apiTypes';
import type { Env } from '../env';
import { scopeChar, scopeFromChar } from '../../shared/opds';
import { findOpdsToken, isOpdsScope, touchOpdsToken } from '../db/opdsTokens';
import { findUserById, findUserBySlug } from '../db/users';
import { hashOpdsToken } from '../services/opdsToken';
import { checkRateLimit } from '../services/rateLimit';

export interface OpdsVariables {
  opdsUser: string;
  opdsScope: OpdsScope;
  // Catalog root path in the form the client actually used, so feed links stay
  // on the short path for a reader configured with it.
  opdsBase: string;
}

export type OpdsEnv = { Bindings: Env; Variables: OpdsVariables };

export const OPDS_TOUCH_INTERVAL = 60;
export const OPDS_RATE_LIMIT = 20;
export const OPDS_RATE_WINDOW = 900;

export const unauthorized = (): Response =>
  new Response('Unauthorized', { status: 401, headers: { 'www-authenticate': 'Basic realm="Spinecast"' } });

const parseBasic = (header: string | undefined): string | null => {
  if (!header) return null;
  const [scheme, encoded] = header.split(' ');
  if (scheme?.toLowerCase() !== 'basic' || !encoded) return null;
  try {
    const decoded = atob(encoded);
    const sep = decoded.indexOf(':');
    return sep === -1 ? null : decoded.slice(sep + 1);
  } catch {
    return null;
  }
};

const equalHex = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
};

export const opdsAuth = createMiddleware<OpdsEnv>(async (c, next) => {
  // Two mounts land here: the short /o/:slug/:scope path and the original
  // /opds/:userId/:scope one, kept so already-configured readers keep working.
  const slug = c.req.param('slug') ?? null;
  const rawScope = c.req.param('scope') ?? '';
  const userId = slug === null ? (c.req.param('userId') ?? '') : '';
  const scope = slug === null ? (isOpdsScope(rawScope) ? rawScope : null) : scopeFromChar(rawScope);
  if (!scope || (slug === null ? !userId : !slug)) return c.text('Not found', 404);

  const ip = c.req.header('cf-connecting-ip') ?? 'unknown';
  const rateKey = `opds:${ip}`;
  const failures = Number((await c.env.SESSIONS.get(`ratelimit:${rateKey}`)) ?? '0');
  if (failures >= OPDS_RATE_LIMIT) return c.text('Too many attempts', 429);

  const password = parseBasic(c.req.header('authorization'));
  // An unknown slug is answered like a wrong token, so scanning the short path
  // cannot tell an existing catalog from a missing one.
  const user = password === null ? null : slug === null ? await findUserById(c.env.DB, userId) : await findUserBySlug(c.env.DB, slug);
  const row = user === null ? null : await findOpdsToken(c.env.DB, user.id, scope);
  const ok = row !== null && password !== null && equalHex(await hashOpdsToken(password), row.token_hash);
  if (!ok || user === null || user.disabled_at !== null) {
    if (!ok) await checkRateLimit(c.env.SESSIONS, rateKey, OPDS_RATE_LIMIT, OPDS_RATE_WINDOW);
    return unauthorized();
  }

  const now = Math.floor(Date.now() / 1000);
  if (row.last_used_at === null || now - row.last_used_at >= OPDS_TOUCH_INTERVAL) await touchOpdsToken(c.env.DB, user.id, scope, now);
  c.set('opdsUser', user.id);
  c.set('opdsScope', scope);
  c.set('opdsBase', slug === null ? `/opds/${user.id}/${scope}` : `/o/${slug}/${scopeChar(scope)}`);
  await next();
});
