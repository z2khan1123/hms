import type { Role } from '@hms/shared';

/**
 * One-click demo sign-in.
 *
 * This is a demonstration convenience and a serious liability anywhere else: a
 * login page that hands out hospital-admin credentials is not a login page. So
 * it is OFF unless the build says otherwise.
 *
 * `import.meta.env.DEV` covers the dev server. A production build shows it only
 * when `VITE_DEMO_LOGIN=1` was set at build time — which means an ordinary
 * production build cannot display these, whatever the browser or the server
 * does later. That is the point of deciding it at build time rather than at
 * runtime: there is no request that can turn it back on.
 */
export const demoLoginsEnabled: boolean =
  import.meta.env.DEV || import.meta.env.VITE_DEMO_LOGIN === '1';

/** Matches the seed. Overridable for a demo seeded with a different password. */
const DEMO_PASSWORD =
  (import.meta.env.VITE_DEMO_PASSWORD as string | undefined) ??
  'ChangeMe123!demo';

export interface DemoLogin {
  role: Role;
  email: string;
  password: string;
  /** What this account can actually do, so a click is not a surprise. */
  note: string;
}

/**
 * Ordered the way somebody exploring the system would want them: the two
 * accounts that see the most first, then the clinical roles, then the desk.
 */
export const DEMO_LOGINS: readonly DemoLogin[] = [
  {
    role: 'platform_admin',
    email: 'superadmin@demo-hospital.test',
    password: DEMO_PASSWORD,
    // Worth saying plainly: this one looks empty, and that is correct.
    note: 'Platform operator — manages tenants, sees no clinical data',
  },
  {
    role: 'hospital_admin',
    email: 'admin@demo-hospital.test',
    password: DEMO_PASSWORD,
    note: 'Everything in this hospital',
  },
  {
    role: 'doctor',
    email: 'doctor@demo-hospital.test',
    password: DEMO_PASSWORD,
    note: 'Queue, consultations, prescribing, orders',
  },
  {
    role: 'nurse',
    email: 'nurse@demo-hospital.test',
    password: DEMO_PASSWORD,
    note: 'Vitals, ward, nurse notes',
  },
  {
    role: 'pharmacist',
    email: 'pharmacist@demo-hospital.test',
    password: DEMO_PASSWORD,
    note: 'Medicines, stock, dispensing',
  },
  {
    role: 'pathologist',
    email: 'pathologist@demo-hospital.test',
    password: DEMO_PASSWORD,
    note: 'Lab worklist, results, blood bank',
  },
  {
    role: 'radiologist',
    email: 'radiologist@demo-hospital.test',
    password: DEMO_PASSWORD,
    note: 'Imaging worklist and reports',
  },
  {
    role: 'accountant',
    email: 'accountant@demo-hospital.test',
    password: DEMO_PASSWORD,
    note: 'Billing, payments, ledgers, payroll, reports',
  },
  {
    role: 'receptionist',
    email: 'receptionist@demo-hospital.test',
    password: DEMO_PASSWORD,
    note: 'Registration, appointments, cash, front office',
  },
];
