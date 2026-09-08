import { type Permission, roleHasPermission } from '@hms/shared';
import type { AuthUser } from './auth-user.js';

/**
 * Does this caller hold this permission?
 *
 * One function so the guard and anything else asking cannot drift. An API key
 * is judged ONLY on its scopes — never on the role it was issued under — so a
 * key can never do more than it was explicitly granted.
 */
export function callerHasPermission(
  user: AuthUser,
  permission: Permission,
): boolean {
  if (user.scopes) return user.scopes.includes(permission);
  return roleHasPermission(user.role, permission);
}
