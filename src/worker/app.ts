import { Hono } from 'hono';
import type { AppEnv } from './appEnv';
import { ApiError } from './errors';
import { authRoutes } from './routes/auth';
import { bookRoutes } from './routes/books';
import { bookmarkRoutes } from './routes/bookmarks';
import { clippingRoutes } from './routes/clippings';
import { deviceRoutes } from './routes/devices';
import { inviteRoutes } from './routes/invites';
import { progressRoutes } from './routes/progress';
import { readingSessionRoutes } from './routes/readingSessions';
import { statsRoutes } from './routes/stats';
import { syncRoutes } from './routes/sync';
import { opdsRoutes } from './opds/routes';
import { opdsCatalogRoutes } from './routes/opdsCatalogs';
import { opdsTokenRoutes } from './routes/opdsTokens';
import { passkeyRoutes } from './routes/passkeys';

export type { AppEnv };

export const app = new Hono<AppEnv>();

app.get('/api/health', (c) => c.json({ status: 'ok' }));

app.route('/api/auth', authRoutes);
app.route('/api/invites', inviteRoutes);
app.route('/api/books', bookRoutes);
app.route('/api/books', progressRoutes);
app.route('/api/books', bookmarkRoutes);
app.route('/api/books', clippingRoutes);
app.route('/api/books', readingSessionRoutes);
app.route('/api/stats', statsRoutes);
app.route('/api/sync', syncRoutes);
app.route('/api/opds/catalogs', opdsCatalogRoutes);
app.route('/api/opds/tokens', opdsTokenRoutes);
app.route('/api/devices', deviceRoutes);
app.route('/api/passkeys', passkeyRoutes);
app.route('/opds/:userId/:scope', opdsRoutes);

app.notFound((c) => c.json({ error: { code: 'not_found', message: 'Not found' } }, 404));

app.onError((err, c) => {
  if (err instanceof ApiError) {
    return c.json({ error: { code: err.code, message: err.message } }, err.status as 400);
  }
  console.error(err);
  return c.json({ error: { code: 'internal', message: 'Internal error' } }, 500);
});
