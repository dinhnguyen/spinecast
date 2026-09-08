import { Hono } from 'hono';
import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { AppEnv } from '../appEnv';
import { ApiError } from '../errors';
import { findInvite, markInviteUsed } from '../db/invites';
import { findUserByEmail, findUserById, insertUser, updateUserLocale, updateUserTimezoneIfUnset } from '../db/users';
import { findDevice, insertDevice, pruneDevices, touchDevice } from '../db/devices';
import { findPasskeyById, touchPasskey } from '../db/passkeys';
import { consumePasswordReset, findPasswordReset } from '../db/passwordResets';
import { putChallenge, takeChallenge } from '../services/challenge';
import { authenticationOptions, verifyAuthentication } from '../services/webauthn';
import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import { deviceNameFromUserAgent } from '../services/deviceName';
import { hashPassword, randomHex, sha256Hex, verifyPassword } from '../services/crypto';
import { isValidTimeZone } from '../services/localTime';
import { checkRateLimit, clearRateLimit } from '../services/rateLimit';
import { createSession, deleteSession } from '../services/session';
import { requireAuth, SESSION_COOKIE } from '../middleware/requireAuth';
import {
  LOCALES,
  type ChangePasswordInput,
  type Locale,
  type ResetPasswordInput,
  type UpdateMeInput,
  type UserDto,
} from '../../shared/apiTypes';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

const readJson = async <T>(c: { req: { json: () => Promise<unknown> } }): Promise<Partial<T>> => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    throw new ApiError(400, 'validation', 'body must be JSON');
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'validation', 'body must be JSON');
  return body as Partial<T>;
};

const validateCredentials = (email: unknown, password: unknown): { email: string; password: string } => {
  if (typeof email !== 'string' || !EMAIL_RE.test(email)) throw new ApiError(400, 'validation', 'invalid email');
  if (typeof password !== 'string' || password.length < MIN_PASSWORD)
    throw new ApiError(400, 'validation', `password must be at least ${MIN_PASSWORD} characters`);
  return { email: email.toLowerCase(), password };
};

const isLocale = (v: unknown): v is Locale => typeof v === 'string' && (LOCALES as readonly string[]).includes(v);

const setSessionCookie = (c: Parameters<typeof setCookie>[0], token: string, ttlSeconds: number): void => {
  setCookie(c, SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    maxAge: ttlSeconds,
  });
};

// The id this browser was handed last time. Scoped to the user on lookup, so a
// claim can only ever rebind someone to their own row.
const CLAIMED = /^dev-[0-9a-f]{12}$/;

const newDevice = async (c: { env: AppEnv['Bindings']; req: { header: (n: string) => string | undefined } }, userId: string, now: number): Promise<string> => {
  // last_seen_at is seeded at login and the session KV key expires exactly SESSION_TTL_SECONDS
  // after that login, so a row older than the TTL cannot back a live session.
  await pruneDevices(c.env.DB, userId, now - Number(c.env.SESSION_TTL_SECONDS));

  // One browser stays one device row across logouts; without this a login always
  // minted a row and the devices screen filled with identical entries.
  const claimed = c.req.header('x-device-id');
  if (claimed && CLAIMED.test(claimed) && (await findDevice(c.env.DB, userId, claimed))) {
    await touchDevice(c.env.DB, userId, claimed, now);
    return claimed;
  }

  const id = `dev-${randomHex(6)}`;
  await insertDevice(c.env.DB, {
    id,
    user_id: userId,
    name: deviceNameFromUserAgent(c.req.header('user-agent') ?? null),
    created_at: now,
    last_seen_at: now,
  });
  return id;
};

const startSession = async (
  c: Context<AppEnv>,
  user: { id: string; email: string; role: 'admin' | 'user'; locale: Locale; session_epoch: number },
  now: number,
): Promise<UserDto> => {
  const deviceId = await newDevice(c, user.id, now);
  const token = await createSession(c.env, user.id, deviceId, user.session_epoch);
  setSessionCookie(c, token, Number(c.env.SESSION_TTL_SECONDS));
  return { id: user.id, email: user.email, role: user.role, locale: user.locale, deviceId };
};

export const authRoutes = new Hono<AppEnv>();

authRoutes.post('/register', async (c) => {
  const body = await readJson<{ email: string; password: string; invite: string; locale?: string }>(c);
  const { email, password } = validateCredentials(body.email, body.password);
  if (typeof body.invite !== 'string' || !body.invite) throw new ApiError(400, 'validation', 'invite required');
  const invite = await findInvite(c.env.DB, body.invite);
  const now = Math.floor(Date.now() / 1000);
  if (!invite || invite.used_by || invite.expires_at < now)
    throw new ApiError(403, 'invite_invalid', 'invite invalid or expired');
  if (await findUserByEmail(c.env.DB, email)) throw new ApiError(409, 'email_taken', 'email already registered');
  const id = randomHex(16);
  const locale: Locale = isLocale(body.locale) ? body.locale : 'vi';
  await insertUser(c.env.DB, { id, email, password_hash: await hashPassword(password), role: 'user', locale, created_at: now });
  await markInviteUsed(c.env.DB, invite.code, id);
  const dto = await startSession(c, { id, email, role: 'user', locale, session_epoch: 0 }, now);
  return c.json(dto, 201);
});

authRoutes.post('/login', async (c) => {
  const body = await readJson<{ email: string; password: string }>(c);
  if (typeof body.email !== 'string' || typeof body.password !== 'string')
    throw new ApiError(400, 'validation', 'email and password required');
  const ip = c.req.header('cf-connecting-ip') ?? 'local';
  const rlKey = `login:${ip}:${body.email.toLowerCase()}`;
  if (!(await checkRateLimit(c.env.SESSIONS, rlKey, 10, 15 * 60)))
    throw new ApiError(429, 'rate_limited', 'too many attempts');
  const user = await findUserByEmail(c.env.DB, body.email);
  if (!user || !(await verifyPassword(body.password, user.password_hash)))
    throw new ApiError(401, 'invalid_credentials', 'invalid credentials');
  if (user.disabled_at !== null) throw new ApiError(403, 'account_disabled', 'account disabled');
  const dto = await startSession(c, user, Math.floor(Date.now() / 1000));
  return c.json(dto);
});

authRoutes.post('/logout', requireAuth, async (c) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await deleteSession(c.env, token);
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
  return c.body(null, 204);
});

authRoutes.get('/me', requireAuth, (c) => c.json(c.var.user satisfies UserDto));

authRoutes.patch('/me', requireAuth, async (c) => {
  const body = await readJson<UpdateMeInput>(c);
  // Both fields are validated before either is written, so a rejected request
  // leaves nothing behind.
  if (body.locale === undefined && body.timezone === undefined)
    throw new ApiError(400, 'validation', 'locale or timezone required');
  if (body.locale !== undefined && !isLocale(body.locale)) throw new ApiError(400, 'validation', 'locale must be vi or en');
  if (body.timezone !== undefined && (typeof body.timezone !== 'string' || !isValidTimeZone(body.timezone)))
    throw new ApiError(400, 'validation', 'timezone must be a known IANA zone');
  // Each field is written only when sent. The client seeds the timezone on every
  // page load, and echoing back the locale it read would overwrite a switch the
  // user made while that request was in flight.
  if (body.locale !== undefined) await updateUserLocale(c.env.DB, c.var.user.id, body.locale);
  // The timezone is written only when unset: a login from another country must
  // not silently rewrite a setting the user chose.
  if (body.timezone !== undefined) await updateUserTimezoneIfUnset(c.env.DB, c.var.user.id, body.timezone);
  const dto: UserDto = { ...c.var.user, locale: body.locale ?? c.var.user.locale };
  return c.json(dto);
});

authRoutes.post('/passkey/options', async (c) => {
  const ip = c.req.header('cf-connecting-ip') ?? 'local';
  if (!(await checkRateLimit(c.env.SESSIONS, `passkey:${ip}`, 20, 15 * 60)))
    throw new ApiError(429, 'rate_limited', 'too many attempts');
  const options = await authenticationOptions(c.req.url);
  const challengeId = await putChallenge(c.env.SESSIONS, options.challenge);
  return c.json({ challengeId, options });
});

authRoutes.post('/passkey/verify', async (c) => {
  const ip = c.req.header('cf-connecting-ip') ?? 'local';
  if (!(await checkRateLimit(c.env.SESSIONS, `passkey:${ip}`, 20, 15 * 60)))
    throw new ApiError(429, 'rate_limited', 'too many attempts');
  const body = await readJson<{ challengeId: string; credential: AuthenticationResponseJSON }>(c);
  if (typeof body.challengeId !== 'string') throw new ApiError(400, 'validation', 'challengeId required');
  if (typeof body.credential !== 'object' || body.credential === null) throw new ApiError(400, 'validation', 'credential required');
  const expectedChallenge = await takeChallenge(c.env.SESSIONS, body.challengeId);
  if (!expectedChallenge) throw new ApiError(400, 'challenge_expired', 'challenge expired');

  const credentialId = typeof body.credential.id === 'string' ? body.credential.id : '';
  const row = await findPasskeyById(c.env.DB, credentialId);
  // An unknown credential and a bad signature share one response, so this
  // endpoint says nothing about which credentials exist.
  if (!row) throw new ApiError(401, 'invalid_credentials', 'invalid credentials');

  let newCounter: number;
  try {
    newCounter = await verifyAuthentication({ requestUrl: c.req.url, expectedChallenge, response: body.credential, row });
  } catch {
    throw new ApiError(401, 'invalid_credentials', 'invalid credentials');
  }

  const user = await findUserById(c.env.DB, row.user_id);
  if (!user) throw new ApiError(401, 'invalid_credentials', 'invalid credentials');
  if (user.disabled_at !== null) throw new ApiError(403, 'account_disabled', 'account disabled');
  const now = Math.floor(Date.now() / 1000);
  await touchPasskey(c.env.DB, row.id, newCounter, now);
  return c.json(await startSession(c, user, now));
});

authRoutes.post('/reset', async (c) => {
  const ip = c.req.header('cf-connecting-ip') ?? 'local';
  if (!(await checkRateLimit(c.env.SESSIONS, `reset:${ip}`, 10, 900)))
    throw new ApiError(429, 'rate_limited', 'too many attempts');
  const body = await readJson<ResetPasswordInput>(c);
  if (typeof body.code !== 'string' || !body.code) throw new ApiError(400, 'reset_invalid', 'invalid reset code');
  const codeHash = await sha256Hex(body.code);
  const row = await findPasswordReset(c.env.DB, codeHash);
  const now = Math.floor(Date.now() / 1000);
  if (!row || row.used_at !== null) throw new ApiError(400, 'reset_invalid', 'invalid reset code');
  if (row.expires_at <= now) throw new ApiError(400, 'reset_expired', 'reset code expired');
  const owner = await findUserById(c.env.DB, row.user_id);
  if (!owner) throw new ApiError(400, 'reset_invalid', 'invalid reset code');
  if (owner.disabled_at !== null) throw new ApiError(403, 'account_disabled', 'account disabled');
  const { password } = validateCredentials(owner.email, body.password);
  const user = await consumePasswordReset(c.env.DB, codeHash, await hashPassword(password), Math.floor(Date.now() / 1000));
  if (!user) throw new ApiError(400, 'reset_invalid', 'invalid reset code');
  c.header('Cache-Control', 'no-store');
  return c.json(await startSession(c, user, Math.floor(Date.now() / 1000)));
});

authRoutes.post('/password', requireAuth, async (c) => {
  const rlKey = `password:${c.var.user.id}`;
  if (!(await checkRateLimit(c.env.SESSIONS, rlKey, 10, 15 * 60)))
    throw new ApiError(429, 'rate_limited', 'too many attempts');
  const body = await readJson<ChangePasswordInput>(c);
  if (typeof body.signOutOthers !== 'boolean') throw new ApiError(400, 'validation', 'signOutOthers must be boolean');
  const user = await findUserById(c.env.DB, c.var.user.id);
  if (!user) throw new ApiError(401, 'unauthorized', 'user not found');
  if (typeof body.current !== 'string' || !(await verifyPassword(body.current, user.password_hash)))
    throw new ApiError(400, 'invalid_credentials', 'current password is wrong');
  await clearRateLimit(c.env.SESSIONS, rlKey);
  const { password } = validateCredentials(user.email, body.password);
  const passwordHash = await hashPassword(password);
  const now = Math.floor(Date.now() / 1000);
  if (body.signOutOthers) {
    await c.env.DB.batch([
      c.env.DB
        .prepare('update users set password_hash = ?, session_epoch = session_epoch + 1 where id = ?')
        .bind(passwordHash, user.id),
    ]);
    const fresh = (await findUserById(c.env.DB, user.id))!;
    return c.json(await startSession(c, fresh, now));
  }
  await c.env.DB.prepare('update users set password_hash = ? where id = ?').bind(passwordHash, user.id).run();
  return c.json(c.var.user satisfies UserDto);
});
