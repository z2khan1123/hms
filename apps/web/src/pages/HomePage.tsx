import { Link } from 'react-router-dom';
import { ROLE_LABELS } from '@hms/shared';
import { useAuth } from '../lib/auth-context';
import { sectionsFor } from '../lib/sections';

/**
 * Where everyone lands after signing in.
 *
 * It shows only what this role can actually open. That is the point: sending
 * every role to `/patients` meant a platform operator signed in successfully
 * and was met with "Missing permission(s): patient:read", which reads as the
 * software being broken rather than as the permission working.
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
            {ROLE_LABELS[user.role]} manages tenants and user accounts across the
            platform rather than any one hospital's clinical work, so none of the
            hospital screens apply to it. This is the permission model working,
            not a fault.
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
