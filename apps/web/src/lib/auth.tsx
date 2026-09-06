import { useCallback, useMemo, useState, type ReactNode } from 'react';
import type { AuthResponse, SessionUser } from '@hms/shared';
import { api, clearSession, SESSION_USER_KEY, tokenStore } from './api';
import {
  AuthContext,
  type AuthState,
  type RegisterArgs,
} from './auth-context';

function readStoredUser(): SessionUser | null {
  try {
    const raw = localStorage.getItem(SESSION_USER_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(readStoredUser);

  const persist = useCallback((res: AuthResponse) => {
    tokenStore.set(res.accessToken, res.refreshToken);
    try {
      localStorage.setItem(SESSION_USER_KEY, JSON.stringify(res.user));
    } catch {
      /* ignore */
    }
    setUser(res.user);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const { data } = await api.post<AuthResponse>('/auth/login', {
        email,
        password,
      });
      persist(data);
    },
    [persist],
  );

  const register = useCallback(
    async (input: RegisterArgs) => {
      const { data } = await api.post<AuthResponse>('/auth/register', input);
      persist(data);
    },
    [persist],
  );

  const logout = useCallback(() => {
    const refresh = tokenStore.refresh;
    if (refresh) {
      void api.post('/auth/logout', { refreshToken: refresh }).catch(() => {});
    }
    clearSession();
    setUser(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, login, register, logout }),
    [user, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
