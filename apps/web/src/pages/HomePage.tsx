import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  BLOOD_GROUPS,
  ROLE_LABELS,
  formatMoney,
  type BedBoard,
  type BloodStock,
  type LedgerSummary,
  type PendingChargeGroup,
} from '@hms/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useCan } from '../lib/permissions';
import { sectionsFor } from '../lib/sections';
import { Icon } from '../components/Icon';

/**
 * The dashboard.
 *
 * Every panel is gated on the permission its data needs, and the query is not
 * issued at all without it — a nurse should not be making a request that can
 * only come back 403, and a panel nobody can fill should not be on the page.
 * What a role sees here is therefore a true picture of what that role does.
 */
export function HomePage() {
  const { user } = useAuth();
  const can = useCan();

  // Every hook below runs on every render. Returning early on a missing user
  // before them would call a different number of hooks the moment the session
  // ends, which React treats as a hard error rather than an empty page.
  const canBeds = can('ward:read');
  const canBilling = can('payment:create');
  const canFinance = can('finance:read');
  const canBlood = can('blood:read');
  const canOpd = can('opd:read');

  const beds = useQuery({
    queryKey: ['wards', 'board'],
    queryFn: async () => (await api.get<BedBoard>('/wards/board')).data,
    enabled: canBeds,
  });

  const pending = useQuery({
    queryKey: ['billing', 'pending'],
    queryFn: async () =>
      (await api.get<PendingChargeGroup[]>('/billing/pending')).data,
    enabled: canBilling,
  });

  const finance = useQuery({
    queryKey: ['finance', 'summary', 'dashboard'],
    queryFn: async () => (await api.get<LedgerSummary>('/finance/summary')).data,
    enabled: canFinance,
  });

  const blood = useQuery({
    queryKey: ['blood', 'stock'],
    queryFn: async () => (await api.get<BloodStock>('/blood/stock')).data,
    enabled: canBlood,
  });

  if (!user) return null;

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const bedTotals = beds.data?.totals;
  const occupancyPct =
    bedTotals && bedTotals.total > 0
      ? Math.round((bedTotals.occupied / bedTotals.total) * 100)
      : 0;

  const pendingTotal = (pending.data ?? []).reduce(
    (sum, group) => sum + group.pendingMinor,
    0,
  );

  const sections = sectionsFor(user.role).filter((s) => s.path !== '/home');

  return (
    <section className="home">
      <header className="home-head">
        <h1>
          {greeting}, {user.firstName}
        </h1>
        <p className="muted">
          Signed in as {ROLE_LABELS[user.role]}. {today()}
        </p>
      </header>

      {/* The figures. Only the ones this role is allowed to know. */}
      {(canBeds || canBilling || canFinance || canBlood) && (
        <div className="kpi-row">
          {canBeds && (
            <div className="kpi">
              <span className="kpi-label">
                <Icon name="beds" size={13} />
                Bed occupancy
              </span>
              <span className="kpi-value">
                {occupancyPct}
                <span className="unit">%</span>
              </span>
              <span className="kpi-note">
                {bedTotals
                  ? `${bedTotals.occupied} of ${bedTotals.total} occupied · ${bedTotals.available} free`
                  : '—'}
              </span>
              <span
                className={`kpi-bar${occupancyPct >= 90 ? ' is-danger' : occupancyPct >= 75 ? ' is-warning' : ''}`}
              >
                <span style={{ width: `${occupancyPct}%` }} />
              </span>
            </div>
          )}

          {canBilling && (
            <div className="kpi">
              <span className="kpi-label">
                <Icon name="billing" size={13} />
                Awaiting payment
              </span>
              <span className="kpi-value">{formatMoney(pendingTotal)}</span>
              <span className="kpi-note">
                {(pending.data ?? []).length} case
                {(pending.data ?? []).length === 1 ? '' : 's'} with outstanding charges
              </span>
            </div>
          )}

          {canFinance && (
            <>
              <div className="kpi">
                <span className="kpi-label">
                  <Icon name="finance" size={13} />
                  Income this period
                </span>
                <span className="kpi-value">
                  {finance.data ? formatMoney(finance.data.incomeMinor) : '—'}
                </span>
                <span className="kpi-note">
                  {finance.data
                    ? `${formatMoney(finance.data.expenseMinor)} spent`
                    : 'Loading…'}
                </span>
              </div>
              <div className="kpi">
                <span className="kpi-label">
                  <Icon name="analytics" size={13} />
                  Net position
                </span>
                <span className="kpi-value">
                  {finance.data ? formatMoney(finance.data.netMinor) : '—'}
                </span>
                <span className="kpi-note">
                  {finance.data
                    ? finance.data.netMinor > 0
                      ? 'In surplus'
                      : finance.data.netMinor < 0
                        ? 'In deficit'
                        : 'Exactly break-even'
                    : 'Loading…'}
                </span>
              </div>
            </>
          )}

          {canBlood && !canFinance && (
            <div className="kpi">
              <span className="kpi-label">
                <Icon name="blood" size={13} />
                Blood units available
              </span>
              <span className="kpi-value">{blood.data?.totals.available ?? '—'}</span>
              <span className="kpi-note">
                {blood.data
                  ? `${blood.data.totals.expiringSoon} expiring within 7 days`
                  : 'Loading…'}
              </span>
            </div>
          )}
        </div>
      )}

      {/* The panels. */}
      {(canBlood || canBeds || canFinance) && (
        <div className="panel-row">
          {canBlood && (
            <div className="panel">
              <div className="panel-head">
                <Icon name="blood" size={15} />
                <h2>Blood bank</h2>
                <span className="spacer" />
                <Link to="/blood">Open</Link>
              </div>
              <div className="panel-body">
                {blood.data ? (
                  <>
                    <div className="blood-grid">
                      {BLOOD_GROUPS.map((group) => {
                        const row = blood.data.byGroup.find(
                          (g) => g.bloodGroup === group,
                        );
                        const n = row?.available ?? 0;
                        return (
                          <div
                            key={group}
                            className={`blood-cell${n === 0 ? ' is-empty' : ''}`}
                          >
                            <div className="g">{group}</div>
                            <div className="n">{n}</div>
                          </div>
                        );
                      })}
                    </div>
                    <p className="muted" style={{ margin: '11px 0 0', fontSize: 12 }}>
                      {blood.data.totals.available} available ·{' '}
                      {blood.data.totals.expiringSoon} expiring soon ·{' '}
                      {blood.data.totals.issued} issued
                    </p>
                  </>
                ) : (
                  <p className="panel-empty" style={{ padding: 0 }}>
                    Loading…
                  </p>
                )}
              </div>
            </div>
          )}

          {canBeds && (
            <div className="panel">
              <div className="panel-head">
                <Icon name="beds" size={15} />
                <h2>Beds</h2>
                <span className="spacer" />
                <Link to="/beds">Open</Link>
              </div>
              <div className="panel-body">
                <div className="stat-list">
                  <div className="stat-line">
                    <span className="k">Occupied</span>
                    <span className="spacer" />
                    <span className="v">{bedTotals?.occupied ?? '—'}</span>
                  </div>
                  <div className="stat-line">
                    <span className="k">Available</span>
                    <span className="spacer" />
                    <span className="v">{bedTotals?.available ?? '—'}</span>
                  </div>
                  <div className="stat-line">
                    <span className="k">Blocked</span>
                    <span className="spacer" />
                    <span className="v">{bedTotals?.blocked ?? '—'}</span>
                  </div>
                  <div className="stat-line">
                    <span className="k">Total</span>
                    <span className="spacer" />
                    <span className="v">{bedTotals?.total ?? '—'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {canFinance && (
            <div className="panel">
              <div className="panel-head">
                <Icon name="finance" size={15} />
                <h2>Income by head</h2>
                <span className="spacer" />
                <Link to="/finance">Open</Link>
              </div>
              <div className="panel-body">
                {finance.data && finance.data.byIncomeHead.length > 0 ? (
                  <div className="stat-list">
                    {finance.data.byIncomeHead.slice(0, 6).map((head) => (
                      <div className="stat-line" key={head.headId}>
                        <span className="k">{head.name}</span>
                        <span className="spacer" />
                        <span className="v">{formatMoney(head.amountMinor)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="muted" style={{ margin: 0, fontSize: 13 }}>
                    Nothing recorded in this period.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Everything this role can open. The one thing every role has. */}
      <div className="panel">
        <div className="panel-head">
          <Icon name="dashboard" size={15} />
          <h2>{canOpd ? 'Go to' : 'Your sections'}</h2>
        </div>
        <div className="panel-body">
          {sections.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              The {ROLE_LABELS[user.role]} role has not been granted access to any
              section. This is the permission model working, not a fault — ask an
              administrator if you need a section opened up.
            </p>
          ) : (
            <div className="shortcut-grid">
              {sections.map((s) => (
                <Link key={s.path} to={s.path} className="shortcut" title={s.description}>
                  <Icon name={s.icon} size={17} />
                  <span>{s.label}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function today(): string {
  return new Date().toLocaleDateString('en-PK', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
