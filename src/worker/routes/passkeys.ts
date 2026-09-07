import { Hono } from 'hono';
import type { AppEnv } from '../appEnv';
import { ApiError } from '../errors';
import { deletePasskey, findPasskeyById, insertPasskey, listPasskeys, renamePasskey, toPasskeyDto } from '../db/passkeys';
import { findUserById } from '../db/users';
import { requireAuth } from '../middleware/requireAuth';
import { verifyPassword } from '../services/crypto';
import { putChallenge, takeChallenge } from '../services/challenge';
import { DEVICE_NAME_MAX, deviceNameFromUserAgent } from '../services/deviceName';
import { checkRateLimit } from '../services/rateLimit';
import { registrationOptions, verifyRegistration } from '../services/webauthn';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';

export const passkeyRoutes = new Hono<AppEnv>();
passkeyRoutes.use('*', requireAuth);

const readJson = async (c: { req: { json: () => Promise<unknown> } }): Promise<Record<string, unknown>> => {
  try {
    return (await c.req.json()) as Record<string, unknown>;
  } catch {
    throw new ApiError(400, 'validation', 'body must be JSON');
  }
};

const validName = (raw: unknown, fallback: string): string => {
  if (raw === undefined) return fallback;
  if (typeof raw !== 'string') throw new ApiError(400, 'validation', 'name must be a string');
  const name = raw.trim();
  if (!name) return fallback;
  if (name.length > DEVICE_NAME_MAX) throw new ApiError(400, 'validation', `name must be at most ${DEVICE_NAME_MAX} characters`);
  return name;
};

passkeyRoutes.get('/', async (c) => c.json({ items: (await listPasskeys(c.env.DB, c.var.user.id)).map(toPasskeyDto) }));

passkeyRoutes.post('/register/options', async (c) => {
  const body = await readJson(c);
  if (!(await checkRateLimit(c.env.SESSIONS, `steppw:${c.var.user.id}`, 10, 15 * 60)))
    throw new ApiError(429, 'rate_limited', 'too many attempts');
  const user = await findUserById(c.env.DB, c.var.user.id);
  if (!user) throw new ApiError(401, 'unauthorized', 'user not found');
  // A passkey is a permanent extra key to the account, so a borrowed cookie
  // must not be enough to mint one.
  if (typeof body['password'] !== 'string' || !(await verifyPassword(body['password'], user.password_hash)))
    throw new ApiError(401, 'invalid_credentials', 'invalid credentials');

  const options = await registrationOptions({
    requestUrl: c.req.url,
    userId: user.id,
    email: user.email,
    existing: await listPasskeys(c.env.DB, user.id),
  });
  const challengeId = await putChallenge(c.env.SESSIONS, options.challenge);
  return c.json({ challengeId, options });
});

passkeyRoutes.post('/register/verify', async (c) => {
  const body = await readJson(c);
  if (typeof body['challengeId'] !== 'string') throw new ApiError(400, 'validation', 'challengeId required');
  if (typeof body['credential'] !== 'object' || body['credential'] === null) throw new ApiError(400, 'validation', 'credential required');
  const expectedChallenge = await takeChallenge(c.env.SESSIONS, body['challengeId']);
  if (!expectedChallenge) throw new ApiError(400, 'challenge_expired', 'challenge expired');

  let cred;
  try {
    cred = await verifyRegistration({ requestUrl: c.req.url, expectedChallenge, response: body['credential'] as RegistrationResponseJSON });
  } catch {
    throw new ApiError(401, 'invalid_credentials', 'invalid credentials');
  }

  const now = Math.floor(Date.now() / 1000);
  const name = validName(body['name'], deviceNameFromUserAgent(c.req.header('user-agent') ?? null));
  const stored = await insertPasskey(c.env.DB, {
    id: cred.id,
    user_id: c.var.user.id,
    public_key: cred.publicKey,
    counter: cred.counter,
    transports: cred.transports,
    name,
    created_at: now,
    last_used_at: null,
  });
  if (!stored) throw new ApiError(409, 'duplicate', 'credential already registered');
  const row = await findPasskeyById(c.env.DB, cred.id);
  return c.json(toPasskeyDto(row!), 201);
});

passkeyRoutes.patch('/:id', async (c) => {
  const body = await readJson(c);
  if (typeof body['name'] !== 'string' || !body['name'].trim()) throw new ApiError(400, 'validation', 'name required');
  const name = validName(body['name'], '');
  if (!(await renamePasskey(c.env.DB, c.var.user.id, c.req.param('id'), name))) throw new ApiError(404, 'not_found', 'passkey not found');
  const row = await findPasskeyById(c.env.DB, c.req.param('id'));
  return c.json(toPasskeyDto(row!));
});

passkeyRoutes.delete('/:id', async (c) => {
  if (!(await deletePasskey(c.env.DB, c.var.user.id, c.req.param('id')))) throw new ApiError(404, 'not_found', 'passkey not found');
  return c.body(null, 204);
});
