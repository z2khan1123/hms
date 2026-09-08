import { Link } from 'react-router-dom';
import { ROLE_LABELS } from '@hms/shared';
import { useAuth } from '../lib/auth-context';
import { sectionsFor } from '../lib/sections';

/**
 * Where everyone lands after signing in.
 *
 * It shows only what this role can actually open. That is the point: sending
 * every role to `/patients` meant a role without `patient:read` signed in
 * successfully and was met with "Missing permission(s): patient:read", which
 * reads as the software being broken rather than as the permission working.
 *
 * No role is empty today — the master account holds everything — but the
 * empty case is still handled, because a narrower role is one matrix edit away.
 */
export function HomePage() {
  const { user } = useAuth();
  if (!user) return null;

  const sections = sectionsFor(user.role);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  return (
    <section className="home">
      <header className="home-head">
        <h1>
          {greeting}, {user.firstName}
        </h1>
        <p className="muted">
          Signed in as {ROLE_LABELS[user.role]}.
          {sections.length > 0 && ' You can open the sections below.'}
        </p>
      </header>

      {sections.length === 0 ? (
        <div className="card">
          <h2>Nothing to open here</h2>
          <p className="muted">
            The {ROLE_LABELS[user.role]} role has not been granted access to any
            section. This is the permission model working, not a fault — ask an
            administrator if you need a section opened up.
          </p>
        </div>
      ) : (
        <div className="home-grid">
          {sections.map((s) => (
            <Link key={s.path} to={s.path} className="home-card">
              <span className="home-card-label">{s.label}</span>
              <span className="muted">{s.description}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
