import { Hono } from 'hono';
import type { AppEnv } from '../appEnv';
import { cleanupAdminStorage, getAdminOverview } from '../services/adminStorage';

export const adminOverviewRoutes = new Hono<AppEnv>();

adminOverviewRoutes.get('/', async (c) => c.json(await getAdminOverview(c.env.DB, c.env.BOOKS)));

adminOverviewRoutes.post('/cleanup', async (c) => c.json(await cleanupAdminStorage(c.env.DB, c.env.BOOKS)));
