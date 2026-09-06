import { createContext, useContext } from 'react';
import type { SessionUser } from '@hms/shared';

export interface RegisterArgs {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  tenantName: string;
}

export interface AuthState {
  user: SessionUser | null;
  login: (email: string, password: string) => Promise<void>;
  register: (input: RegisterArgs) => Promise<void>;
  logout: () => void;
}

/**
 * The context and its hook live apart from `AuthProvider` on purpose: a module
 * that exports both a component and a non-component breaks React Fast Refresh,
 * which forces a full page reload on every edit and loses in-progress form state.
 */
export const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
