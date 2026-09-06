/**
 * Single source of truth for roles and permissions.
 * The API's PermissionsGuard and the web app's UI gating both read from here.
 */

export const ROLES = [
  'platform_admin',
  'hospital_admin',
  'doctor',
  'nurse',
  'receptionist',
  'accountant',
  'pharmacist',
  'pathologist',
  'radiologist',
  'read_only',
] as const;

export type Role = (typeof ROLES)[number];

export const ROLE_LABELS: Record<Role, string> = {
  platform_admin: 'Platform Admin',
  hospital_admin: 'Hospital Admin',
  doctor: 'Doctor',
  nurse: 'Nurse',
  receptionist: 'Receptionist',
  accountant: 'Accountant',
  pharmacist: 'Pharmacist',
  pathologist: 'Pathologist',
  radiologist: 'Radiologist',
  read_only: 'Read Only',
};

export const PERMISSIONS = [
  // platform
  'tenant:manage',
  // users & staff
  'user:read',
  'user:manage',
  'practitioner:read',
  'practitioner:manage',
  // patients
  'patient:create',
  'patient:read',
  'patient:update',
  'patient:delete',
  // cases
  'case:create',
  'case:read',
  'case:update',
  'case:close',
  // appointments
  'appointment:create',
  'appointment:read',
  'appointment:update',
  'appointment:cancel',
  // OPD
  'opd:create',
  'opd:read',
  'opd:update',
  'opd:cancel',
  // vitals
  'vital:create',
  'vital:read',
  // clinical vocabulary (symptoms, findings, ICD-10)
  'vocabulary:read',
  'vocabulary:manage',
  // service list
  'service:read',
  'service:manage',
  // billing
  'bill:create',
  'bill:read',
  'bill:delete',
  'payment:create',
  'payment:read',
  'payment:reverse',
  // payers
  'tpa:read',
  'tpa:manage',
  // audit
  'audit:read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const READ_ONLY_SET: Permission[] = [
  'patient:read',
  'case:read',
  'appointment:read',
  'opd:read',
  'vital:read',
  'vocabulary:read',
  'practitioner:read',
  'bill:read',
  'service:read',
  'payment:read',
  'tpa:read',
];

/**
 * Role -> permissions. A permission not listed for a role is denied.
 * Add new permissions here explicitly; they default to no access.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  platform_admin: ['tenant:manage', 'user:read'],

  hospital_admin: [...PERMISSIONS.filter((p) => p !== 'tenant:manage')],

  receptionist: [
    'patient:create',
    'patient:read',
    'patient:update',
    'case:create',
    'case:read',
    'case:update',
    'appointment:create',
    'appointment:read',
    'appointment:update',
    'appointment:cancel',
    'opd:create',
    'opd:read',
    'opd:update',
    'opd:cancel',
    'vital:create',
    'vital:read',
    'vocabulary:read',
    'practitioner:read',
    'service:read',
    'bill:create',
    'bill:read',
    'payment:create',
    'payment:read',
    'tpa:read',
  ],

  doctor: [
    'patient:read',
    'patient:update',
    'case:read',
    'case:update',
    'case:close',
    'appointment:read',
    'appointment:update',
    'opd:read',
    'opd:update',
    'vital:create',
    'vital:read',
    'vocabulary:read',
    'vocabulary:manage',
    'practitioner:read',
    'bill:read',
    'bill:create',
  ],

  nurse: [
    'patient:read',
    'case:read',
    'appointment:read',
    'opd:read',
    'opd:update',
    'vital:create',
    'vital:read',
    'vocabulary:read',
    'practitioner:read',
  ],

  accountant: [
    'patient:read',
    'case:read',
    'opd:read',
    'service:read',
    'service:manage',
    'bill:create',
    'bill:read',
    'bill:delete',
    'payment:create',
    'payment:read',
    'payment:reverse',
    'tpa:read',
    'tpa:manage',
    'audit:read',
  ],

  // Their modules land in Phase 3; for now they can see the patient in front of them.
  pharmacist: ['patient:read', 'case:read', 'opd:read', 'vocabulary:read'],
  pathologist: ['patient:read', 'case:read', 'opd:read', 'vocabulary:read'],
  radiologist: ['patient:read', 'case:read', 'opd:read', 'vocabulary:read'],

  read_only: READ_ONLY_SET,
};

export function permissionsForRole(role: Role): ReadonlySet<Permission> {
  return new Set(ROLE_PERMISSIONS[role] ?? []);
}

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return (ROLE_PERMISSIONS[role] ?? []).includes(permission);
}
