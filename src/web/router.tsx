import { createBrowserRouter, Navigate, Outlet } from 'react-router';
import { RequireAdmin, RequireAuth } from './lib/auth';
import { DisabledAccountRedirect } from './components/DisabledAccountRedirect';
import { AdminPage } from './pages/AdminPage';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { ResetPage } from './pages/ResetPage';
import { CatalogBrowsePage } from './pages/CatalogBrowsePage';
import { CatalogsPage } from './pages/CatalogsPage';
import { LibraryPage } from './pages/LibraryPage';
import { ReaderPage } from './pages/ReaderPage';
import { SettingsPage } from './pages/SettingsPage';
import { StatsPage } from './pages/StatsPage';

const RootLayout = () => (
  <>
    <DisabledAccountRedirect />
    <Outlet />
  </>
);

export const router = createBrowserRouter([
  {
    element: <RootLayout />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
      { path: '/reset', element: <ResetPage /> },
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
      { path: '/settings/invites', element: <Navigate to="/admin/invites" replace /> },
      { path: '/admin', element: <RequireAuth><RequireAdmin><AdminPage /></RequireAdmin></RequireAuth> },
      { path: '/admin/users', element: <RequireAuth><RequireAdmin><AdminPage section="users" /></RequireAdmin></RequireAuth> },
      { path: '/admin/invites', element: <RequireAuth><RequireAdmin><AdminPage section="invites" /></RequireAdmin></RequireAuth> },
    ],
  },
]);
