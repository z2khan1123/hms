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
  // doctor's orders (lab tests, imaging, procedures)
  'order:create',
  'order:read',
  /// start / complete an order in a department worklist
  'order:update',
  'order:cancel',
  // diagnostics catalogue and reports
  'labtest:read',
  'labtest:manage',
  'report:read',
  'report:write',
  // prescriptions
  'prescription:read',
  'prescription:write',
  // billing
  'bill:create',
  'bill:read',
  'bill:delete',
  /// release an unpaid order to a department (a waiver)
  'bill:approve',
  /// reduce an unpaid charge — a doctor obliging a patient on his own fee
  'bill:discount',
  'payment:create',
  'payment:read',
  'payment:reverse',
  // wards and beds
  'ward:read',
  'ward:manage',
  // inpatient
  'admission:create',
  'admission:read',
  'admission:transfer',
  'admission:discharge',
  'nursenote:read',
  'nursenote:write',
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
  'order:read',
  'prescription:read',
  'ward:read',
  'admission:read',
  'nursenote:read',
  'labtest:read',
  'report:read',
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
    'order:read',
    'prescription:read',
    'ward:read',
    'admission:create',
    'admission:read',
    'admission:transfer',
    'nursenote:read',
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
    // Needed to pick what to order — order:create without it is unusable.
    'service:read',
    'bill:read',
    'bill:create',
    'order:create',
    'order:read',
    'order:cancel',
    // He ordered the test; he must be able to read what came back.
    'labtest:read',
    'report:read',
    'bill:discount',
    'prescription:read',
    'prescription:write',
    'ward:read',
    'admission:create',
    'admission:read',
    'admission:transfer',
    'admission:discharge',
    'nursenote:read',
    'nursenote:write',
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
    'order:read',
    'prescription:read',
    'ward:read',
    'admission:read',
    'admission:transfer',
    'nursenote:read',
    'nursenote:write',
    'report:read',
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
    'bill:approve',
    'bill:discount',
    'order:read',
    'ward:read',
    'admission:read',
    'payment:create',
    'payment:read',
    'payment:reverse',
    'audit:read',
  ],

  // Department staff work a queue of released orders. Results arrive in Phase 3.
  pathologist: [
    'patient:read', 'case:read', 'opd:read', 'vocabulary:read',
    'order:read', 'order:update', 'prescription:read',
    'labtest:read', 'labtest:manage', 'report:read', 'report:write',
  ],
  radiologist: [
    'patient:read', 'case:read', 'opd:read', 'vocabulary:read',
    'order:read', 'order:update', 'prescription:read',
    'labtest:read', 'labtest:manage', 'report:read', 'report:write',
  ],
  pharmacist: [
    'patient:read', 'case:read', 'opd:read', 'vocabulary:read',
    'order:read', 'prescription:read',
  ],

  read_only: READ_ONLY_SET,
};

export function permissionsForRole(role: Role): ReadonlySet<Permission> {
  return new Set(ROLE_PERMISSIONS[role] ?? []);
}

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return (ROLE_PERMISSIONS[role] ?? []).includes(permission);
}
