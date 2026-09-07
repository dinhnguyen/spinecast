import { Hono } from 'hono';
import type { AppEnv } from '../appEnv';
import type { OpdsScope, OpdsTokenCreatedDto, OpdsTokenDto, OpdsTokensDto } from '../../shared/apiTypes';
import { ApiError } from '../errors';
import { countSharedBooks } from '../db/opdsBooks';
import { deleteOpdsToken, findOpdsToken, isOpdsScope, upsertOpdsToken, type OpdsTokenRow } from '../db/opdsTokens';
import { requireAuth } from '../middleware/requireAuth';
import { generateOpdsToken, hashOpdsToken } from '../services/opdsToken';

export const opdsTokenRoutes = new Hono<AppEnv>();
opdsTokenRoutes.use('*', requireAuth);

const toDto = (row: OpdsTokenRow | null): OpdsTokenDto | null =>
  row ? { createdAt: row.created_at, lastUsedAt: row.last_used_at } : null;

const scopeParam = (raw: string): OpdsScope => {
  if (!isOpdsScope(raw)) throw new ApiError(404, 'not_found', 'unknown scope');
  return raw;
};

opdsTokenRoutes.get('/', async (c) => {
  const [library, pub, sharedCount] = await Promise.all([
    findOpdsToken(c.env.DB, c.var.user.id, 'library'),
    findOpdsToken(c.env.DB, c.var.user.id, 'public'),
    countSharedBooks(c.env.DB, c.var.user.id),
  ]);
  const dto: OpdsTokensDto = { library: toDto(library), public: toDto(pub), sharedCount };
  return c.json(dto);
});

opdsTokenRoutes.post('/:scope', async (c) => {
  const scope = scopeParam(c.req.param('scope'));
  const token = generateOpdsToken();
  await upsertOpdsToken(c.env.DB, c.var.user.id, scope, await hashOpdsToken(token), Math.floor(Date.now() / 1000));
  const dto: OpdsTokenCreatedDto = { scope, token, url: `${new URL(c.req.url).origin}/opds/${c.var.user.id}/${scope}` };
  return c.json(dto, 201);
});

opdsTokenRoutes.delete('/:scope', async (c) => {
  await deleteOpdsToken(c.env.DB, c.var.user.id, scopeParam(c.req.param('scope')));
  return c.body(null, 204);
});
