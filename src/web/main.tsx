import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { LocaleProvider } from './i18n/LocaleProvider';
import { AuthProvider } from './lib/auth';
import { router } from './router';
import './styles.css';

if (import.meta.env.PROD && 'serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');

const root = document.getElementById('root');
if (!root) throw new Error('missing #root');

createRoot(root).render(
  <StrictMode>
    <LocaleProvider>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </LocaleProvider>
  </StrictMode>,
);
