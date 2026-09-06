import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth-context';

export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="app">
      <header className="topbar">
        <span className="brand">HMS</span>
        <nav>
          <NavLink to="/patients">Patients</NavLink>
          <NavLink to="/appointments">Appointments</NavLink>
          <NavLink to="/opd">OPD</NavLink>
          <NavLink to="/setup/services">Setup</NavLink>
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
