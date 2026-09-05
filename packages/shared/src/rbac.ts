/**
 * Single source of truth for roles and permissions.
 * The API's RolesGuard and the web app's UI gating both read from here.
 */

export const ROLES = [
  'platform_admin',
  'hospital_admin',
  'front_desk',
  'practitioner',
  'read_only',
] as const;

export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  // platform
  'tenant:manage',
  // users
  'user:read',
  'user:manage',
  // patients
  'patient:create',
  'patient:read',
  'patient:update',
  'patient:delete',
  // practitioners
  'practitioner:read',
  'practitioner:manage',
  // appointments
  'appointment:create',
  'appointment:read',
  'appointment:update',
  'appointment:cancel',
  // audit
  'audit:read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * Role -> permissions. A permission not listed for a role is denied.
 * Add new permissions here explicitly; they default to no access.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  platform_admin: ['tenant:manage', 'user:read'],
  hospital_admin: [
    'user:read',
    'user:manage',
    'patient:create',
    'patient:read',
    'patient:update',
    'patient:delete',
    'practitioner:read',
    'practitioner:manage',
    'appointment:create',
    'appointment:read',
    'appointment:update',
    'appointment:cancel',
    'audit:read',
  ],
  front_desk: [
    'patient:create',
    'patient:read',
    'patient:update',
    'practitioner:read',
    'appointment:create',
    'appointment:read',
    'appointment:update',
    'appointment:cancel',
  ],
  practitioner: [
    'patient:read',
    'practitioner:read',
    'appointment:read',
    'appointment:update',
  ],
  read_only: ['patient:read', 'practitioner:read', 'appointment:read'],
};

export function permissionsForRole(role: Role): ReadonlySet<Permission> {
  return new Set(ROLE_PERMISSIONS[role] ?? []);
}

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return (ROLE_PERMISSIONS[role] ?? []).includes(permission);
}
