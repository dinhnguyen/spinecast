import { Hono } from 'hono';
import type { AdminBookSort } from '../../shared/apiTypes';
import type { AppEnv } from '../appEnv';
import { listAdminBooks } from '../db/adminBooks';
import { ApiError } from '../errors';

export const adminBookRoutes = new Hono<AppEnv>();

adminBookRoutes.get('/', async (c) => {
  const value = c.req.query('sort') ?? 'size';
  if (!['size', 'owner', 'shared'].includes(value)) throw new ApiError(400, 'validation', 'Invalid sort');
  return c.json(await listAdminBooks(c.env.DB, value as AdminBookSort, c.req.query('cursor') ?? null));
});
