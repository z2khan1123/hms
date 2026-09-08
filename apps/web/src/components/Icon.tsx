import type { ReactNode } from 'react';

/**
 * The icon set, as inline SVG.
 *
 * One file, one stroke weight, one 24-unit grid, so icons sitting next to each
 * other in the sidebar look like a set rather than a collection. No icon
 * package: this is thirty small glyphs, and they ship with the page instead of
 * arriving after it.
 */
export type IconName =
  | 'dashboard'
  | 'patients'
  | 'appointments'
  | 'opd'
  | 'queue'
  | 'billing'
  | 'beds'
  | 'admissions'
  | 'worklist'
  | 'reports'
  | 'medicines'
  | 'stock'
  | 'dispense'
  | 'blood'
  | 'ambulance'
  | 'finance'
  | 'referrals'
  | 'inventory'
  | 'staff'
  | 'analytics'
  | 'frontoffice'
  | 'registers'
  | 'services'
  | 'labtests'
  | 'wards'
  | 'customfields'
  | 'portal'
  | 'integration'
  | 'search'
  | 'menu'
  | 'logout'
  | 'chevron'
  | 'plus'
  | 'close';

const PATHS: Record<IconName, ReactNode> = {
  dashboard: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </>
  ),
  patients: (
    <>
      <circle cx="9" cy="8" r="3.2" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M17 11h4M19 9v4" />
    </>
  ),
  appointments: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
      <path d="M8 14h3" />
    </>
  ),
  opd: (
    <>
      <path d="M4 21V8l8-5 8 5v13" />
      <path d="M2 21h20" />
      <path d="M12 11v5M9.5 13.5h5" />
    </>
  ),
  queue: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  billing: (
    <>
      <path d="M6 2h12a1 1 0 0 1 1 1v19l-3-2-2 2-2-2-2 2-2-2-3 2V3a1 1 0 0 1 1-1Z" />
      <path d="M9 8h6M9 12h6" />
    </>
  ),
  beds: (
    <>
      <path d="M3 20V8M3 12h13a4 4 0 0 1 4 4v4M3 20h18" />
      <circle cx="7.5" cy="9.5" r="1.8" />
    </>
  ),
  admissions: (
    <>
      <path d="M4 21V6a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v15" />
      <path d="M2 21h20M15 10h4a1 1 0 0 1 1 1v10" />
      <path d="M9 9v4M7 11h4" />
    </>
  ),
  worklist: (
    <>
      <path d="M9 3h6a1 1 0 0 1 1 1v1H8V4a1 1 0 0 1 1-1Z" />
      <path d="M8 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2" />
      <path d="m9 13 2 2 4-4" />
    </>
  ),
  reports: (
    <>
      <path d="M14 2H7a1 1 0 0 0-1 1v18a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6Z" />
      <path d="M14 2v4h4" />
      <path d="M9 13h6M9 17h4" />
    </>
  ),
  medicines: (
    <>
      <path d="M10.5 20.5a5 5 0 0 1-7-7l6-6a5 5 0 0 1 7 7Z" />
      <path d="m6.5 10.5 7 7" />
    </>
  ),
  stock: (
    <>
      <path d="M3 7l9-4 9 4-9 4-9-4Z" />
      <path d="M3 12l9 4 9-4M3 17l9 4 9-4" />
    </>
  ),
  dispense: (
    <>
      <path d="M8 3h8l-1 5H9L8 3Z" />
      <path d="M9 8v3l-3 4v5a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1v-5l-3-4V8" />
      <path d="M9 17h6" />
    </>
  ),
  blood: (
    <>
      <path d="M12 3s6 6.5 6 10a6 6 0 0 1-12 0c0-3.5 6-10 6-10Z" />
      <path d="M9.5 14h5M12 11.5v5" />
    </>
  ),
  ambulance: (
    <>
      <path d="M2 17V8a1 1 0 0 1 1-1h10v10" />
      <path d="M13 10h4l4 4v3h-2" />
      <circle cx="7" cy="18" r="2" />
      <circle cx="17" cy="18" r="2" />
      <path d="M7 10v4M5 12h4" />
    </>
  ),
  finance: (
    <>
      <path d="M3 21V10M9 21V4M15 21v-8M21 21V7" />
      <path d="M2 21h20" />
    </>
  ),
  referrals: (
    <>
      <circle cx="7" cy="7" r="3" />
      <circle cx="17" cy="17" r="3" />
      <path d="M10 7h5a2 2 0 0 1 2 2v5" />
    </>
  ),
  inventory: (
    <>
      <rect x="3" y="7" width="18" height="14" rx="2" />
      <path d="M3 11h18M8 7V4h8v3" />
    </>
  ),
  staff: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <circle cx="17.5" cy="9.5" r="2.5" />
      <path d="M15 20a5 5 0 0 1 6.5-4.8" />
    </>
  ),
  analytics: (
    <>
      <path d="M3 3v18h18" />
      <path d="m7 14 3-4 3 3 5-6" />
    </>
  ),
  frontoffice: (
    <>
      <path d="M3 20h18M5 20v-6a7 7 0 0 1 14 0v6" />
      <path d="M12 7V4M10 4h4" />
    </>
  ),
  registers: (
    <>
      <path d="M5 3h11l4 4v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path d="M16 3v4h4" />
      <path d="M9 12h6M9 16h6" />
    </>
  ),
  services: (
    <>
      <path d="M4 6h16M4 12h16M4 18h10" />
      <circle cx="18" cy="18" r="2.5" />
    </>
  ),
  labtests: (
    <>
      <path d="M9 3v7L4.5 18A2 2 0 0 0 6.2 21h11.6a2 2 0 0 0 1.7-3L15 10V3" />
      <path d="M8 3h8M7.5 15h9" />
    </>
  ),
  wards: (
    <>
      <path d="M3 21V9l9-6 9 6v12" />
      <path d="M2 21h20" />
      <rect x="9" y="13" width="6" height="8" />
    </>
  ),
  customfields: (
    <>
      <rect x="3" y="4" width="18" height="6" rx="1.5" />
      <rect x="3" y="14" width="12" height="6" rx="1.5" />
    </>
  ),
  portal: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18Z" />
    </>
  ),
  integration: (
    <>
      <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
      <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  logout: (
    <>
      <path d="M9 21H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </>
  ),
  chevron: <path d="m9 6 6 6-6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
};

export function Icon({
  name,
  size = 18,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
