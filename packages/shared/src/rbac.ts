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
  // pharmacy
  'medicine:read',
  'medicine:manage',
  'stock:read',
  'stock:manage',
  'dispense:read',
  'dispense:create',
  /// A patient's recorded allergies — what prescribing actually checks against.
  'allergy:read',
  'allergy:write',
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
  // human resources
  'staff:read',
  'staff:manage',
  'attendance:read',
  'attendance:mark',
  'leave:read',
  'leave:apply',
  'leave:approve',
  'roster:read',
  'roster:manage',
  'payroll:read',
  'payroll:manage',
  // finance ledgers and referrals
  'finance:read',
  'finance:manage',
  'referral:read',
  'referral:manage',
  // general inventory (pharmacy stock is separate)
  'inventory:read',
  'inventory:manage',
  // analytics — the saved-view layer that replaces hardcoded report pages.
  // Reaching a dataset ALSO requires that dataset's own read permission, so
  // this grants the screen, never the data behind it.
  'analytics:read',
  /// save a view for everyone, not just yourself
  'analytics:share',
  // audit
  'audit:read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const READ_ONLY_SET: Permission[] = [
  'analytics:read',
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
  'medicine:read',
  'stock:read',
  'dispense:read',
  'allergy:read',
  'finance:read',
  'referral:read',
  'inventory:read',
  'staff:read',
  'attendance:read',
  'leave:read',
  'roster:read',
];

/**
 * Role -> permissions. A permission not listed for a role is denied.
 * Add new permissions here explicitly; they default to no access.
 */
export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  platform_admin: ['tenant:manage', 'user:read'],

  hospital_admin: PERMISSIONS.filter((p) => p !== 'tenant:manage'),

  receptionist: [
    // The front desk takes money; it should be able to report on its own day.
    // Which datasets that reaches is still decided per dataset.
    'analytics:read',
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
    'allergy:read',
    // Everyone employed here sees their own roster and asks for leave.
    'attendance:read',
    'leave:read',
    'leave:apply',
    'roster:read',
  ],

  doctor: [
    'analytics:read',
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
    'medicine:read',
    'dispense:read',
    // He diagnoses the allergy, so he is the one who records it.
    'allergy:read',
    'allergy:write',
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
    // Everyone employed here sees their own roster and asks for leave.
    'attendance:read',
    'leave:read',
    'leave:apply',
    'roster:read',
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
    'medicine:read',
    'allergy:read',
    'dispense:read',
    // Everyone employed here sees their own roster and asks for leave.
    'attendance:read',
    'leave:read',
    'leave:apply',
    'roster:read',
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
    'stock:read',
    'dispense:read',
    'finance:read',
    'finance:manage',
    'staff:read',
    'payroll:read',
    'payroll:manage',
    'referral:read',
    'referral:manage',
    'inventory:read',
    'analytics:read',
    'analytics:share',
    'ward:read',
    'admission:read',
    'payment:create',
    'payment:read',
    'payment:reverse',
    'audit:read',
    // Everyone employed here sees their own roster and asks for leave.
    'attendance:read',
    'leave:read',
    'leave:apply',
    'roster:read',
  ],

  // Department staff work a queue of released orders. Results arrive in Phase 3.
  pathologist: [
    'patient:read', 'case:read', 'opd:read', 'vocabulary:read',
    'order:read', 'order:update', 'prescription:read',
    'labtest:read', 'labtest:manage', 'report:read', 'report:write',
    // Everyone employed here sees their own roster and asks for leave.
    'attendance:read',
    'leave:read',
    'leave:apply',
    'roster:read',
  ],
  radiologist: [
    'patient:read', 'case:read', 'opd:read', 'vocabulary:read',
    'order:read', 'order:update', 'prescription:read',
    'labtest:read', 'labtest:manage', 'report:read', 'report:write',
    // Everyone employed here sees their own roster and asks for leave.
    'attendance:read',
    'leave:read',
    'leave:apply',
    'roster:read',
  ],
  pharmacist: [
    'patient:read', 'case:read', 'opd:read', 'vocabulary:read',
    'order:read', 'prescription:read',
    'medicine:read', 'medicine:manage',
    'stock:read', 'stock:manage',
    'dispense:read', 'dispense:create',
    // Dispensing without sight of the patient's allergies would be negligent.
    'allergy:read',
    'bill:read', 'bill:create',
    // Everyone employed here sees their own roster and asks for leave.
    'attendance:read',
    'leave:read',
    'leave:apply',
    'roster:read',
  ],

  read_only: READ_ONLY_SET,
};

export function permissionsForRole(role: Role): ReadonlySet<Permission> {
  return new Set(ROLE_PERMISSIONS[role] ?? []);
}

export function roleHasPermission(role: Role, permission: Permission): boolean {
  return (ROLE_PERMISSIONS[role] ?? []).includes(permission);
}
