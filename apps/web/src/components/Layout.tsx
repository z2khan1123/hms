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
          {can('report:read') && <NavLink to="/reports">Reports</NavLink>}
          {can('medicine:read') && (
            <details className="nav-menu">
              <summary>Pharmacy</summary>
              <div
                className="nav-menu-list"
                onClick={(e) =>
                  e.currentTarget.closest('details')?.removeAttribute('open')
                }
              >
                <NavLink to="/pharmacy/medicines">Medicines</NavLink>
                {can('stock:read') && <NavLink to="/pharmacy/stock">Stock</NavLink>}
                {can('dispense:read') && (
                  <NavLink to="/pharmacy/dispense">Dispense</NavLink>
                )}
              </div>
            </details>
          )}
          {(can('finance:read') ||
            can('referral:read') ||
            can('inventory:read')) && (
            <details className="nav-menu">
              <summary>Finance</summary>
              <div
                className="nav-menu-list"
                onClick={(e) =>
                  e.currentTarget.closest('details')?.removeAttribute('open')
                }
              >
                {can('finance:read') && <NavLink to="/finance">Overview</NavLink>}
                {can('referral:read') && (
                  <NavLink to="/finance/referrals">Referrals</NavLink>
                )}
                {can('inventory:read') && (
                  <NavLink to="/inventory">Inventory</NavLink>
                )}
              </div>
            </details>
          )}
          {can('staff:read') && <NavLink to="/hr">Staff</NavLink>}
          {can('analytics:read') && <NavLink to="/analytics">Reports</NavLink>}
          {(can('blood:read') ||
            can('call:read') ||
            can('birth:read') ||
            can('frontoffice:read')) && (
            <details className="nav-menu">
              <summary>Services</summary>
              <div
                className="nav-menu-list"
                onClick={(e) =>
                  e.currentTarget.closest('details')?.removeAttribute('open')
                }
              >
                {can('blood:read') && <NavLink to="/blood">Blood bank</NavLink>}
                {can('call:read') && <NavLink to="/ambulance">Ambulance</NavLink>}
                {(can('birth:read') || can('death:read')) && (
                  <NavLink to="/registers">Registers</NavLink>
                )}
                {can('frontoffice:read') && (
                  <NavLink to="/front-office">Front office</NavLink>
                )}
              </div>
            </details>
          )}
          <details className="nav-menu">
            <summary>Setup</summary>
            <div
              className="nav-menu-list"
              onClick={(e) =>
                e.currentTarget.closest('details')?.removeAttribute('open')
              }
            >
              <NavLink to="/setup/services">Services</NavLink>
              {can('apikey:read') && (
                <NavLink to="/integration">Integration</NavLink>
              )}
              {can('portal:manage') && (
                <NavLink to="/patient-portal">Patient portal</NavLink>
              )}
              {can('labtest:read') && <NavLink to="/setup/lab-tests">Lab tests</NavLink>}
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
