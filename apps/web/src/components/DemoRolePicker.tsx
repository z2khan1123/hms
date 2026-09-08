import type { ReactNode } from 'react';
import { ROLE_LABELS, type Role } from '@hms/shared';
import { DEMO_LOGINS, type DemoLogin } from '../lib/demo-logins';

/**
 * The quick demo sign-in grid.
 *
 * Reusable and self-contained: it renders the roles and reports the choice, and
 * knows nothing about how the form or the session works. That is what lets it
 * sit on the login page today and a "switch role" panel later without either
 * one reaching into it.
 *
 * It never signs anybody in. Filling the form and submitting it are separate
 * acts, so nobody lands in the wrong account by brushing a button — and it
 * matches how the reference product behaves.
 */
export function DemoRolePicker({
  selected,
  onSelect,
  title = 'Quick demo login',
}: {
  selected: Role | null;
  onSelect: (login: DemoLogin) => void;
  title?: string;
}) {
  return (
    <section className="demo-roles" aria-label={title}>
      <h2 className="demo-roles-title">{title}</h2>
      <div className="demo-roles-grid">
        {DEMO_LOGINS.map((d) => (
          <button
            key={d.role}
            type="button"
            className={`demo-role role-${d.role}${selected === d.role ? ' is-selected' : ''}`}
            // The note is the accessible description as well as the tooltip: a
            // screen reader should not get "Doctor" nine times with no way to
            // tell which does what.
            title={d.note}
            aria-label={`${ROLE_LABELS[d.role]} — ${d.note}`}
            aria-pressed={selected === d.role}
            onClick={() => onSelect(d)}
          >
            <span className="demo-role-icon" aria-hidden="true">
              {ROLE_ICONS[d.role]}
            </span>
            <span className="demo-role-name">{ROLE_LABELS[d.role]}</span>
          </button>
        ))}
      </div>
      <p className="demo-roles-note">
        Fills the form above. Press Sign in to continue.
      </p>
    </section>
  );
}

/**
 * Inline SVG rather than an icon package: nine small glyphs do not justify a
 * dependency, and these load with the page instead of after it.
 */
const svg = (children: ReactNode) => (
  <svg
    viewBox="0 0 24 24"
    width="16"
    height="16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {children}
  </svg>
);

const ROLE_ICONS: Record<Role, ReactNode> = {
  // Platform operator: layered building blocks, not a clinical symbol.
  platform_admin: svg(
    <>
      <path d="M12 3 3 8l9 5 9-5-9-5Z" />
      <path d="M3 16l9 5 9-5" />
      <path d="M3 12l9 5 9-5" />
    </>,
  ),
  // Hospital: a building with a cross.
  hospital_admin: svg(
    <>
      <path d="M4 21V6a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v15" />
      <path d="M2 21h20" />
      <path d="M12 8v6M9 11h6" />
    </>,
  ),
  // Stethoscope.
  doctor: svg(
    <>
      <path d="M6 3v5a4 4 0 0 0 8 0V3" />
      <path d="M6 3H4M14 3h2" />
      <path d="M10 12v3a5 5 0 0 0 5 5 4 4 0 0 0 4-4v-2" />
      <circle cx="19" cy="12" r="2" />
    </>,
  ),
  // Heart with a pulse line.
  nurse: svg(
    <>
      <path d="M20.8 6.6a5 5 0 0 0-8.8-1.7 5 5 0 0 0-8.8 1.7c-.7 3 1.6 5.6 4 7.9L12 20l4.8-5.5c2.4-2.3 4.7-4.9 4-7.9Z" />
      <path d="M3.5 12h3l1.5-2.5L10 14l1.5-2h3" />
    </>,
  ),
  // Pill.
  pharmacist: svg(
    <>
      <path d="M10.5 20.5a5 5 0 0 1-7-7l6-6a5 5 0 0 1 7 7Z" />
      <path d="M6.5 10.5 13.5 17.5" />
    </>,
  ),
  // Microscope.
  pathologist: svg(
    <>
      <path d="M6 18h12" />
      <path d="M9 18a5 5 0 0 0 8-4" />
      <path d="M10 6 8 8l3 3 2-2Z" />
      <path d="M11.5 4.5 13 3l4 4-1.5 1.5" />
      <path d="M4 21h16" />
    </>,
  ),
  // Scan / rays.
  radiologist: svg(
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M7 8v8M12 8v8M17 8v8" />
    </>,
  ),
  // Ledger with a currency line.
  accountant: svg(
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 8h8M8 12h5M8 16h3" />
    </>,
  ),
  // Front desk: a person behind a counter.
  receptionist: svg(
    <>
      <circle cx="12" cy="8" r="3" />
      <path d="M5 20a7 7 0 0 1 14 0" />
      <path d="M3 20h18" />
    </>,
  ),
  // Present for completeness — read_only is not offered as a demo account.
  read_only: svg(
    <>
      <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Z" />
      <circle cx="12" cy="12" r="2.5" />
    </>,
  ),
};
