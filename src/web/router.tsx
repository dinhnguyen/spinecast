import { createBrowserRouter } from 'react-router';
import { RequireAdmin, RequireAuth } from './lib/auth';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { CatalogBrowsePage } from './pages/CatalogBrowsePage';
import { CatalogsPage } from './pages/CatalogsPage';
import { LibraryPage } from './pages/LibraryPage';
import { ReaderPage } from './pages/ReaderPage';
import { SettingsPage } from './pages/SettingsPage';
import { StatsPage } from './pages/StatsPage';

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  { path: '/', element: <RequireAuth><LibraryPage /></RequireAuth> },
  { path: '/catalogs', element: <RequireAuth><CatalogsPage /></RequireAuth> },
  { path: '/catalogs/:id', element: <RequireAuth><CatalogBrowsePage /></RequireAuth> },
  { path: '/read/:bookId', element: <RequireAuth><ReaderPage /></RequireAuth> },
  { path: '/stats', element: <RequireAuth><StatsPage /></RequireAuth> },
  { path: '/settings', element: <RequireAuth><SettingsPage /></RequireAuth> },
  { path: '/settings/sync', element: <RequireAuth><SettingsPage section="sync" /></RequireAuth> },
  { path: '/settings/devices', element: <RequireAuth><SettingsPage section="devices" /></RequireAuth> },
  { path: '/settings/passkeys', element: <RequireAuth><SettingsPage section="passkeys" /></RequireAuth> },
  { path: '/settings/opds', element: <RequireAuth><SettingsPage section="opds" /></RequireAuth> },
  { path: '/settings/account', element: <RequireAuth><SettingsPage section="account" /></RequireAuth> },
  { path: '/settings/invites', element: <RequireAuth><RequireAdmin><SettingsPage section="invites" /></RequireAdmin></RequireAuth> },
]);
