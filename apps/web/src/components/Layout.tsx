import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';
import { useCan } from '../lib/permissions';

export function Layout() {
  const { user, logout } = useAuth();
  const can = useCan();
  const navigate = useNavigate();

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">HMS</span>
        <nav>
          <NavLink to="/patients">Patients</NavLink>
          <NavLink to="/appointments">Appointments</NavLink>
          <NavLink to="/opd">OPD</NavLink>
          {can('opd:read') && <NavLink to="/queue">Queue</NavLink>}
          {can('ward:read') && <NavLink to="/beds">Beds</NavLink>}
          {can('admission:read') && <NavLink to="/admissions">Admissions</NavLink>}
          {can('payment:create') && <NavLink to="/billing/pending">Billing</NavLink>}
          {can('order:update') && <NavLink to="/worklist">Worklist</NavLink>}
          <details className="nav-menu">
            <summary>Setup</summary>
            <div
              className="nav-menu-list"
              onClick={(e) =>
                e.currentTarget.closest('details')?.removeAttribute('open')
              }
            >
              <NavLink to="/setup/services">Services</NavLink>
              {can('ward:read') && <NavLink to="/setup/wards">Wards &amp; beds</NavLink>}
            </div>
          </details>
        </nav>
        <div className="spacer" />
        <span className="user">
          {user ? `${user.firstName} ${user.lastName} · ${user.role}` : ''}
        </span>
        <button
          className="secondary"
          onClick={() => {
            logout();
            navigate('/login');
          }}
        >
          Sign out
        </button>
      </header>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
