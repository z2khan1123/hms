import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { AuthResponse, SessionUser } from '@hms/shared';
import { api, tokenStore } from './api';

export interface RegisterArgs {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  tenantName: string;
}

interface AuthState {
  user: SessionUser | null;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterArgs) => Promise<void>;
  logout: () => void;
}

const USER_KEY = 'hms.user';
const AuthContext = createContext<AuthState | null>(null);

function readStoredUser(): SessionUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
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
      localStorage.setItem(USER_KEY, JSON.stringify(res.user));
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
    tokenStore.clear();
    try {
      localStorage.removeItem(USER_KEY);
    } catch {
      /* ignore */
    }
    setUser(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ user, login, register, logout }),
    [user, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
