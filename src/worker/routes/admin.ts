import { Hono } from 'hono';
import type { AppEnv } from '../appEnv';
import { requireAdmin, requireAuth } from '../middleware/requireAuth';
import { adminOverviewRoutes } from './adminOverview';
import { adminUserRoutes } from './adminUsers';

export const adminRoutes = new Hono<AppEnv>();
adminRoutes.use('*', requireAuth, requireAdmin);
adminRoutes.route('/users', adminUserRoutes);
adminRoutes.route('/overview', adminOverviewRoutes);
