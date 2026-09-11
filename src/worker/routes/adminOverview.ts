import { Hono } from 'hono';
import type { AppEnv } from '../appEnv';
import { cleanupAdminStorage, getAdminOverview } from '../services/adminStorage';
import { rehashBooks } from '../services/rehashBooks';

export const adminOverviewRoutes = new Hono<AppEnv>();

adminOverviewRoutes.get('/', async (c) => c.json(await getAdminOverview(c.env.DB, c.env.BOOKS)));

adminOverviewRoutes.post('/cleanup', async (c) => c.json(await cleanupAdminStorage(c.env.DB, c.env.BOOKS)));

adminOverviewRoutes.post('/rehash', async (c) =>
  c.json(await rehashBooks(c.env.DB, c.env.BOOKS, c.req.query('after') ?? null)),
);
