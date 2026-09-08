import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ROLE_LABELS } from '@hms/shared';
import { useAuth } from '../lib/auth-context';
import { SECTIONS, groupedSectionsFor } from '../lib/sections';
import { Icon } from './Icon';
import { OutboxIndicator } from './OutboxIndicator';

/**
 * The application shell: a grouped sidebar down the left, a slim bar across the
 * top, and the page itself below it.
 *
 * The navigation is generated from `sections.ts` rather than written out here.
 * It used to be a hardcoded list that duplicated the same permission checks,
 * and it had already drifted from the list the landing page used — the two
 * disagreed about which sections existed.
 */
export function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  /** Desktop: collapsed to icons. Mobile: the drawer is open. */
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // A navigation on a phone should close the drawer behind you; leaving it open
  // over the page you just asked for is the classic mobile-nav annoyance.
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  if (!user) return null;

  const groups = groupedSectionsFor(user.role);
  const current = currentSection(location.pathname);

  return (
    <div className={`shell${collapsed ? ' is-collapsed' : ''}`}>
      <OutboxIndicator />

      {/* Only rendered while open, so it cannot swallow clicks on desktop. */}
      {drawerOpen && (
        <button
          type="button"
          className="shell-scrim"
          aria-label="Close navigation"
          onClick={() => setDrawerOpen(false)}
        />
      )}

      <aside className={`sidebar${drawerOpen ? ' is-open' : ''}`}>
        <div className="sidebar-brand">
          <span className="sidebar-mark" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 21V7a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v14" />
              <path d="M2 21h20M12 9v7M8.5 12.5h7" />
            </svg>
          </span>
          <span className="sidebar-name">HMS</span>
          <button
            type="button"
            className="sidebar-close"
            aria-label="Close navigation"
            onClick={() => setDrawerOpen(false)}
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Sections">
          {groups.map((group) => (
            <div key={group.key} className="sidebar-group">
              <div className="sidebar-group-label">{group.label}</div>
              {group.items.map((s) => (
                <NavLink
                  key={s.path}
                  to={s.path}
                  className="sidebar-link"
                  // `end` on the dashboard only: without it every path would
                  // match it and two items would look active at once.
                  end={s.path === '/home'}
                  title={collapsed ? s.label : undefined}
                >
                  <Icon name={s.icon} />
                  <span className="sidebar-link-text">{s.label}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <button
          type="button"
          className="sidebar-collapse"
          onClick={() => setCollapsed((v) => !v)}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        >
          <Icon name="chevron" size={16} />
          <span className="sidebar-link-text">Collapse</span>
        </button>
      </aside>

      <div className="shell-main">
        <header className="appbar">
          <button
            type="button"
            className="appbar-burger"
            onClick={() => setDrawerOpen(true)}
            aria-label="Open navigation"
          >
            <Icon name="menu" size={20} />
          </button>

          <h1 className="appbar-title">{current?.label ?? 'HMS'}</h1>

          <div className="appbar-spacer" />

          <div className="appbar-user">
            <span className="appbar-avatar" aria-hidden="true">
              {user.firstName.charAt(0)}
              {user.lastName.charAt(0)}
            </span>
            <span className="appbar-who">
              <span className="appbar-who-name">
                {user.firstName} {user.lastName}
              </span>
              <span className="appbar-who-role">{ROLE_LABELS[user.role]}</span>
            </span>
          </div>

          <button
            type="button"
            className="appbar-signout"
            onClick={() => {
              logout();
              navigate('/login');
            }}
          >
            <Icon name="logout" size={16} />
            <span>Sign out</span>
          </button>
        </header>

        {/* Where you are, and the way back up. */}
        {current && current.path !== '/home' && (
          <nav className="crumbs" aria-label="Breadcrumb">
            <Link to="/home">Dashboard</Link>
            <Icon name="chevron" size={13} />
            <span aria-current="page">{current.label}</span>
          </nav>
        )}

        <main className="content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

/**
 * The section the current URL belongs to. Longest match wins, so
 * `/pharmacy/stock` resolves to Pharmacy stock rather than to whichever of the
 * pharmacy entries happens to come first.
 */
function currentSection(pathname: string) {
  return [...SECTIONS]
    .filter((s) => pathname === s.path || pathname.startsWith(`${s.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0];
}
