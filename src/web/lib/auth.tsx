import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { startAuthentication } from '@simplewebauthn/browser';
import type { Locale, UpdateMeInput, UserDto } from '../../shared/apiTypes';
import { useLocale } from '../i18n/LocaleProvider';
import { api, ApiClientError, UNAUTHORIZED_EVENT } from './api';
import { saveDeviceId } from './deviceId';

// Derived from the function itself rather than imported, so this does not
// depend on which type names the browser package chooses to re-export.
type RequestOptions = Parameters<typeof startAuthentication>[0]['optionsJSON'];

interface AuthValue {
  user: UserDto | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithPasskey: () => Promise<void>;
  register: (email: string, password: string, invite: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  updateLocale: (locale: Locale) => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<UserDto | null>(null);
  const [loading, setLoading] = useState(true);
  const { locale, setLocale } = useLocale();

  // Every path that produces a user records the device it was given, so the next
  // login on this browser claims the same row instead of minting another.
  const remember = useCallback((dto: UserDto) => {
    if (dto.deviceId) saveDeviceId(dto.deviceId);
    setUser(dto);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const dto = await api.get<UserDto>('/api/auth/me');
      remember(dto);
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      // Timezone only: this runs on every page load, so sending the locale back
      // would race a switch the user just made and reinstate the old one.
      if (tz) void api.patch<UserDto>('/api/auth/me', { timezone: tz } satisfies UpdateMeInput).catch(() => {});
    } catch (e) {
      if (e instanceof ApiClientError && e.status === 401) setUser(null);
      else throw e;
    } finally {
      setLoading(false);
    }
  }, [remember]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // api.ts fires this on any 401 after the initial load; re-checking the session
  // finds it gone and clears `user`, which RequireAuth turns into /login.
  useEffect(() => {
    const onUnauthorized = () => void refresh();
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, [refresh]);

  useEffect(() => {
    if (user && user.locale !== locale) setLocale(user.locale);
    // Only the server value drives this; a local switch is handled by updateLocale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.locale]);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading,
      refresh,
      login: async (email, password) => remember(await api.post<UserDto>('/api/auth/login', { email, password })),
      loginWithPasskey: async () => {
        const started = await api.post<{ challengeId: string; options: RequestOptions }>('/api/auth/passkey/options', {});
        const credential = await startAuthentication({ optionsJSON: started.options });
        remember(await api.post<UserDto>('/api/auth/passkey/verify', { challengeId: started.challengeId, credential }));
      },
      register: async (email, password, invite) => remember(await api.post<UserDto>('/api/auth/register', { email, password, invite, locale })),
      logout: async () => {
        await api.post('/api/auth/logout');
        setUser(null);
      },
      updateLocale: async (next) => {
        setLocale(next);
        setUser(await api.patch<UserDto>('/api/auth/me', { locale: next } satisfies UpdateMeInput));
      },
    }),
    [user, loading, refresh, remember, locale, setLocale],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthValue => {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth outside AuthProvider');
  return v;
};

export const RequireAuth = ({ children }: { children: ReactNode }) => {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return null;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
  return <>{children}</>;
};

export const RequireAdmin = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  if (user?.role !== 'admin') return <Navigate to="/settings/sync" replace />;
  return <>{children}</>;
};
