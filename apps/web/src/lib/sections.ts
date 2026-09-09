import { type Permission, type Role, roleHasPermission } from '@hms/shared';
import type { IconName } from '../components/Icon';

/**
 * The application's sections, what each one needs, and where it sits.
 *
 * One list, used by the sidebar, by the landing page and by the "where do I go
 * after signing in" decision, so the three cannot disagree about what a role
 * can reach. Before this the sidebar kept its own hardcoded copy, and the two
 * had already drifted apart.
 */
export interface Section {
  path: string;
  label: string;
  description: string;
  icon: IconName;
  group: GroupKey;
  /** Null means everyone signed in can reach it. */
  permission: Permission | null;
}

/**
 * Sidebar grouping, in the order a hospital actually works: the front desk and
 * the day's flow first, then the clinical floor, then the back office, then the
 * things you set up once and rarely touch.
 */
export const GROUPS = [
  { key: 'operations', label: 'Operations' },
  { key: 'clinical', label: 'Clinical' },
  { key: 'administration', label: 'Administration' },
  { key: 'setup', label: 'Setup' },
] as const;

export type GroupKey = (typeof GROUPS)[number]['key'];

export const SECTIONS: readonly Section[] = [
  {
    path: '/home',
    label: 'Dashboard',
    description: 'The day at a glance',
    icon: 'dashboard',
    group: 'operations',
    permission: null,
  },
  {
    path: '/patients',
    label: 'Patients',
    description: 'Register, search and open a patient record',
    icon: 'patients',
    group: 'operations',
    permission: 'patient:read',
  },
  {
    path: '/appointments',
    label: 'Appointments',
    description: 'The diary, and booking against it',
    icon: 'appointments',
    group: 'operations',
    permission: 'appointment:read',
  },
  {
    path: '/opd',
    label: 'OPD',
    description: 'Outpatient visits and consultations',
    icon: 'opd',
    group: 'operations',
    permission: 'opd:read',
  },
  {
    path: '/queue',
    label: 'Queue',
    description: 'Who is waiting to be seen',
    icon: 'queue',
    group: 'operations',
    permission: 'opd:read',
  },
  {
    path: '/billing/pending',
    label: 'Billing',
    description: 'Charges waiting to be settled',
    icon: 'billing',
    group: 'operations',
    permission: 'payment:create',
  },

  {
    path: '/beds',
    label: 'Bed board',
    description: 'Who is in which bed, and what is free',
    icon: 'beds',
    group: 'clinical',
    permission: 'ward:read',
  },
  {
    path: '/admissions',
    label: 'Admissions',
    description: 'Admit, transfer and discharge',
    icon: 'admissions',
    group: 'clinical',
    permission: 'admission:read',
  },
  {
    path: '/worklist',
    label: 'Worklist',
    description: 'Lab and imaging work waiting to be done',
    icon: 'worklist',
    group: 'clinical',
    permission: 'order:update',
  },
  {
    path: '/reports',
    label: 'Diagnostics',
    description: 'Results, entered and released',
    icon: 'reports',
    group: 'clinical',
    permission: 'report:read',
  },
  {
    path: '/pharmacy/medicines',
    label: 'Medicines',
    description: 'The medicine master and its stock',
    icon: 'medicines',
    group: 'clinical',
    permission: 'medicine:read',
  },
  {
    path: '/pharmacy/stock',
    label: 'Pharmacy stock',
    description: 'Batches, expiry and purchases',
    icon: 'stock',
    group: 'clinical',
    permission: 'stock:read',
  },
  {
    path: '/pharmacy/dispense',
    label: 'Dispensing',
    description: 'Hand out medicine against a prescription',
    icon: 'dispense',
    group: 'clinical',
    permission: 'dispense:create',
  },
  {
    path: '/blood',
    label: 'Blood bank',
    description: 'Stock, donors and issuing',
    icon: 'blood',
    group: 'clinical',
    permission: 'blood:read',
  },
  {
    path: '/ambulance',
    label: 'Ambulance',
    description: 'Fleet and call dispatch',
    icon: 'ambulance',
    group: 'clinical',
    permission: 'call:read',
  },

  {
    path: '/finance',
    label: 'Finance',
    description: 'Income, expenses and the net position',
    icon: 'finance',
    group: 'administration',
    permission: 'finance:read',
  },
  {
    path: '/finance/referrals',
    label: 'Referrals',
    description: 'Referrers and their payouts',
    icon: 'referrals',
    group: 'administration',
    permission: 'referral:read',
  },
  {
    path: '/inventory',
    label: 'Inventory',
    description: 'General stores and stock movement',
    icon: 'inventory',
    group: 'administration',
    permission: 'inventory:read',
  },
  {
    path: '/hr',
    label: 'Staff',
    description: 'People, attendance, leave and payroll',
    icon: 'staff',
    group: 'administration',
    permission: 'staff:read',
  },
  {
    path: '/analytics',
    label: 'Reports',
    description: 'Ask a question of the data and save it',
    icon: 'analytics',
    group: 'administration',
    permission: 'analytics:read',
  },
  {
    path: '/front-office',
    label: 'Front office',
    description: 'Visitors, calls, post and complaints',
    icon: 'frontoffice',
    group: 'administration',
    permission: 'frontoffice:read',
  },
  {
    path: '/registers',
    label: 'Registers',
    description: 'Births and deaths',
    icon: 'registers',
    group: 'administration',
    permission: 'birth:read',
  },

  {
    path: '/setup/users',
    label: 'Users & roles',
    description: 'Staff accounts, and what each role can do',
    icon: 'staff',
    group: 'setup',
    permission: 'user:read',
  },
  {
    path: '/setup/services',
    label: 'Services',
    description: 'What the hospital charges for',
    icon: 'services',
    group: 'setup',
    permission: 'service:read',
  },
  {
    path: '/setup/lab-tests',
    label: 'Lab tests',
    description: 'The test catalogue and its parameters',
    icon: 'labtests',
    group: 'setup',
    permission: 'labtest:read',
  },
  {
    path: '/setup/wards',
    label: 'Wards & beds',
    description: 'Floors, wards, bed types and beds',
    icon: 'wards',
    group: 'setup',
    permission: 'ward:read',
  },
  {
    path: '/setup/custom-fields',
    label: 'Custom fields',
    description: 'Extra fields on the standard records',
    icon: 'customfields',
    group: 'setup',
    permission: 'customfield:manage',
  },
  {
    path: '/patient-portal',
    label: 'Patient portal',
    description: 'Invite patients and handle their requests',
    icon: 'portal',
    group: 'setup',
    permission: 'portal:manage',
  },
  {
    path: '/integration',
    label: 'Integration',
    description: 'API keys and webhooks',
    icon: 'integration',
    group: 'setup',
    permission: 'apikey:read',
  },
];

/** The sections this role can actually open. */
export function sectionsFor(role: Role): Section[] {
  return SECTIONS.filter(
    (s) => s.permission === null || roleHasPermission(role, s.permission),
  );
}

/** The same, grouped for the sidebar, with empty groups dropped. */
export function groupedSectionsFor(
  role: Role,
): { key: GroupKey; label: string; items: Section[] }[] {
  const mine = sectionsFor(role);
  return GROUPS.map((g) => ({
    key: g.key,
    label: g.label,
    items: mine.filter((s) => s.group === g.key),
  })).filter((g) => g.items.length > 0);
}

/**
 * Where to send someone after they sign in.
 *
 * Everyone goes to the dashboard, which then shows only what they can reach.
 * Sending every role to `/patients` meant a role without `patient:read` signed
 * in correctly and was met with a permission error, which reads as the software
 * being broken rather than as the permission working.
 */
export const LANDING_PATH = '/home';
