import { type Permission, type Role, roleHasPermission } from '@hms/shared';

/**
 * The app's sections, and what each one needs.
 *
 * One list, used by the landing page and by the "where do I go after signing
 * in" decision. Before this, the login page sent everyone to `/patients` — so
 * a platform operator, who cannot read patients, signed in successfully and
 * was met with "Missing permission(s): patient:read". Signing in correctly and
 * landing on an error is indistinguishable from the software being broken.
 */
export interface Section {
  path: string;
  label: string;
  description: string;
  /** Null means everyone signed in can reach it. */
  permission: Permission | null;
}

/**
 * Ordered by how a hospital actually works — the front desk first, then the
 * clinical floor, then the back office. The first entry a role can reach is
 * where that role lands.
 */
export const SECTIONS: readonly Section[] = [
  {
    path: '/patients',
    label: 'Patients',
    description: 'Register, search and open a patient record',
    permission: 'patient:read',
  },
  {
    path: '/appointments',
    label: 'Appointments',
    description: 'The diary, and booking against it',
    permission: 'appointment:read',
  },
  {
    path: '/opd',
    label: 'OPD',
    description: 'Outpatient visits and consultations',
    permission: 'opd:read',
  },
  {
    path: '/queue',
    label: 'Queue',
    description: 'Who is waiting to be seen',
    permission: 'opd:read',
  },
  {
    path: '/worklist',
    label: 'Worklist',
    description: 'Lab and imaging work waiting to be done',
    permission: 'order:update',
  },
  {
    path: '/reports',
    label: 'Diagnostic reports',
    description: 'Results, entered and released',
    permission: 'report:read',
  },
  {
    path: '/pharmacy/dispense',
    label: 'Dispensing',
    description: 'Hand out medicine against a prescription',
    permission: 'dispense:create',
  },
  {
    path: '/pharmacy/medicines',
    label: 'Medicines',
    description: 'The medicine master and its stock',
    permission: 'medicine:read',
  },
  {
    path: '/beds',
    label: 'Bed board',
    description: 'Who is in which bed, and what is free',
    permission: 'ward:read',
  },
  {
    path: '/admissions',
    label: 'Admissions',
    description: 'Admit, transfer and discharge',
    permission: 'admission:read',
  },
  {
    path: '/billing/pending',
    label: 'Billing',
    description: 'Charges waiting to be settled',
    permission: 'payment:create',
  },
  {
    path: '/finance',
    label: 'Finance',
    description: 'Income, expenses and referral payouts',
    permission: 'finance:read',
  },
  {
    path: '/blood',
    label: 'Blood bank',
    description: 'Stock, donors and issuing',
    permission: 'blood:read',
  },
  {
    path: '/ambulance',
    label: 'Ambulance',
    description: 'Fleet and call dispatch',
    permission: 'call:read',
  },
  {
    path: '/hr',
    label: 'Staff',
    description: 'People, attendance, leave and payroll',
    permission: 'staff:read',
  },
  {
    path: '/analytics',
    label: 'Reports',
    description: 'Ask a question of the data and save it',
    permission: 'analytics:read',
  },
  {
    path: '/front-office',
    label: 'Front office',
    description: 'Visitors, calls, post and complaints',
    permission: 'frontoffice:read',
  },
  {
    path: '/registers',
    label: 'Registers',
    description: 'Births and deaths',
    permission: 'birth:read',
  },
  {
    path: '/inventory',
    label: 'Inventory',
    description: 'General stores and stock movement',
    permission: 'inventory:read',
  },
  {
    path: '/integration',
    label: 'Integration',
    description: 'API keys and webhooks',
    permission: 'apikey:read',
  },
];

/** The sections this role can actually open. */
export function sectionsFor(role: Role): Section[] {
  return SECTIONS.filter(
    (s) => s.permission === null || roleHasPermission(role, s.permission),
  );
}

/**
 * Where to send someone after they sign in.
 *
 * Everyone goes to the landing page, which then shows only what they can
 * reach. A role with no sections at all — a platform operator, whose work is
 * tenants rather than patients — sees an explanation there rather than a
 * permission error on a screen it was never meant to open.
 */
export const LANDING_PATH = '/home';
