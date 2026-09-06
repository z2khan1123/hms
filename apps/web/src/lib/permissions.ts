import { useCallback } from 'react';
import { roleHasPermission, type Permission } from '@hms/shared';
import { useAuth } from './auth-context';

/**
 * Permission check bound to the signed-in user's role. The API enforces the same
 * table (`packages/shared/src/rbac.ts`); this only hides UI the user cannot use.
 */
export function useCan(): (permission: Permission) => boolean {
  const { user } = useAuth();
  return useCallback(
    (permission: Permission) => (user ? roleHasPermission(user.role, permission) : false),
    [user],
  );
}
