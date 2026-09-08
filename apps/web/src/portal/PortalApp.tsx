import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  formatMoney,
  portalLoginSchema,
  requestAppointmentSchema,
  setPortalPasswordSchema,
  type PortalAppointment,
  type PortalBill,
  type PortalPrescription,
  type PortalReport,
  type PortalSession,
  type PortalSummary,
  type PortalVisit,
} from '@hms/shared';
import { formatDate, formatDateTime, todayIsoDate } from '../lib/format';
import { portalApi, portalErrorMessage, portalSession } from './portal-api';

type TabValue = 'home' | 'visits' | 'reports' | 'prescriptions' | 'bills' | 'appointments';

const TABS: { value: TabValue; label: string }[] = [
  { value: 'home', label: 'Overview' },
  { value: 'visits', label: 'Visits' },
  { value: 'reports', label: 'Reports' },
  { value: 'prescriptions', label: 'Prescriptions' },
  { value: 'bills', label: 'Bills' },
  { value: 'appointments', label: 'Appointments' },
];

function zodMessage(error: {
  issues: { message: string; path: (string | number)[] }[];
}): string {
  return error.issues[0]?.message ?? 'Check the values';
}

function Err({ error, fallback }: { error: unknown; fallback: string }) {
  if (!error) return null;
  return (
    <div className="alert" role="alert">
      {portalErrorMessage(error, fallback)}
    </div>
  );
}

/**
 * The patient's own view. A separate application from the staff app in every
 * way that matters: its own HTTP client, its own session storage, its own
 * shell. A patient never sees staff navigation, and a staff token is never in
 * scope here.
 */
export function PortalApp() {
  const [patient, setPatient] = useState(() => portalSession.patient);
  const [tab, setTab] = useState<TabValue>('home');

  if (!patient) {
    return <PortalEntry onSignedIn={(p) => setPatient(p)} />;
  }

  return (
    <div className="portal">
      <header className="portal-header">
        <div>
          <strong>
            {patient.firstName} {patient.lastName}
          </strong>
          <div className="muted">{patient.mrn}</div>
        </div>
        <button
          type="button"
          onClick={() => {
            portalSession.end();
            setPatient(null);
          }}
        >
          Sign out
        </button>
      </header>

      <nav className="tabs" role="tablist" aria-label="My records">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={t.value === tab}
            onClick={() => setTab(t.value)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main>
        {tab === 'home' && <HomeTab />}
        {tab === 'visits' && <VisitsTab />}
        {tab === 'reports' && <ReportsTab />}
        {tab === 'prescriptions' && <PrescriptionsTab />}
        {tab === 'bills' && <BillsTab />}
        {tab === 'appointments' && <AppointmentsTab />}
      </main>
    </div>
  );
}

// --- signing in --------------------------------------------------------------

function PortalEntry({ onSignedIn }: { onSignedIn: (p: PortalSession['patient']) => void }) {
  const [mode, setMode] = useState<'login' | 'invite'>('login');
  return (
    <div className="portal portal-entry">
      <h1>Your records</h1>
      {mode === 'login' ? (
        <>
          <SignInForm onSignedIn={onSignedIn} />
          <p className="muted">
            First time here? Ask the front desk for an invitation code, then{' '}
            <button type="button" onClick={() => setMode('invite')}>
              set your password
            </button>
            .
          </p>
        </>
      ) : (
        <>
          <SetPasswordForm onDone={() => setMode('login')} />
          <p className="muted">
            <button type="button" onClick={() => setMode('login')}>
              Back to sign in
            </button>
          </p>
        </>
      )}
    </div>
  );
}

function SignInForm({ onSignedIn }: { onSignedIn: (p: PortalSession['patient']) => void }) {
  const [mrn, setMrn] = useState('');
  const [password, setPassword] = useState('');
  const [formErr, setFormErr] = useState<string | null>(null);

  const login = useMutation({
    mutationFn: async () => {
      const body = portalLoginSchema.parse({ mrn, password });
      const { data } = await portalApi.post<PortalSession>('/portal/login', body);
      return data;
    },
    onSuccess: (session) => {
      portalSession.start(session.accessToken, session.patient);
      onSignedIn(session.patient);
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    const parsed = portalLoginSchema.safeParse({ mrn, password });
    if (!parsed.success) {
      setFormErr(zodMessage(parsed.error));
      return;
    }
    login.mutate();
  };

  return (
    <form className="card" onSubmit={submit}>
      <h2>Sign in</h2>
      <label>
        Your MRN
        <input
          value={mrn}
          onChange={(e) => setMrn(e.target.value)}
          placeholder="It is printed on every slip we give you"
          autoComplete="username"
          required
        />
      </label>
      <label>
        Password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />
      </label>
      {formErr && <div className="alert" role="alert">{formErr}</div>}
      <Err error={login.error} fallback="Could not sign you in" />
      <button type="submit" disabled={login.isPending}>
        {login.isPending ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}

function SetPasswordForm({ onDone }: { onDone: () => void }) {
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [formErr, setFormErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const save = useMutation({
    mutationFn: async () => {
      const body = setPortalPasswordSchema.parse({ token, password, confirm });
      await portalApi.post('/portal/set-password', body);
    },
    onSuccess: () => setDone(true),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    const parsed = setPortalPasswordSchema.safeParse({ token, password, confirm });
    if (!parsed.success) {
      setFormErr(zodMessage(parsed.error));
      return;
    }
    save.mutate();
  };

  if (done) {
    return (
      <div className="card">
        <h2>Password set</h2>
        <p>You can sign in with your MRN now.</p>
        <button type="button" onClick={onDone}>Sign in</button>
      </div>
    );
  }

  return (
    <form className="card" onSubmit={submit}>
      <h2>Set your password</h2>
      <label>
        Invitation code
        <input value={token} onChange={(e) => setToken(e.target.value)} required />
      </label>
      <label>
        New password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          minLength={10}
          autoComplete="new-password"
          required
        />
      </label>
      <label>
        Confirm password
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          minLength={10}
          autoComplete="new-password"
          required
        />
      </label>
      <p className="muted">At least 10 characters. The code can only be used once.</p>
      {formErr && <div className="alert" role="alert">{formErr}</div>}
      <Err error={save.error} fallback="Could not set your password" />
      <button type="submit" disabled={save.isPending}>
        {save.isPending ? 'Saving…' : 'Set password'}
      </button>
    </form>
  );
}

// --- tabs ---------------------------------------------------------------------

function usePortal<T>(key: string, path: string) {
  return useQuery({
    queryKey: ['portal', key],
    queryFn: async () => {
      const { data } = await portalApi.get<T>(path);
      return data;
    },
  });
}

function HomeTab() {
  const q = usePortal<PortalSummary>('me', '/portal/me');
  if (q.isPending) return <p className="muted">Loading…</p>;
  if (q.error) return <Err error={q.error} fallback="Could not load your details" />;
  if (!q.data) return null;

  return (
    <div className="card">
      <h2>Hello, {q.data.patient.firstName}</h2>
      <p className="muted">
        MRN {q.data.patient.mrn} · born {formatDate(q.data.patient.birthDate)}
      </p>
      <ul>
        <li>
          {q.data.visitCount} visit{q.data.visitCount === 1 ? '' : 's'}
          {q.data.lastVisitAt && `, the last on ${formatDate(q.data.lastVisitAt)}`}
        </li>
        <li>{q.data.finalisedReports} report(s) ready to read</li>
        <li>{q.data.upcomingAppointments} upcoming appointment(s)</li>
        <li>
          {q.data.outstandingBalanceMinor > 0 ? (
            <>
              <strong>{formatMoney(q.data.outstandingBalanceMinor)}</strong> outstanding
            </>
          ) : (
            'Nothing outstanding'
          )}
        </li>
      </ul>
      <p className="muted">
        Only reports your doctor has released appear here. If something you expect
        is missing, it has not been finalised yet — please ask, rather than
        assuming the result is normal.
      </p>
    </div>
  );
}

function VisitsTab() {
  const q = usePortal<PortalVisit[]>('visits', '/portal/visits');
  if (q.isPending) return <p className="muted">Loading…</p>;
  if (q.error) return <Err error={q.error} fallback="Could not load your visits" />;
  if (!q.data?.length) return <p className="muted">No visits recorded yet.</p>;

  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Visit no.</th>
            <th>Doctor</th>
            <th>Diagnosis</th>
          </tr>
        </thead>
        <tbody>
          {q.data.map((v) => (
            <tr key={v.id}>
              <td>{formatDateTime(v.visitAt)}</td>
              <td>{v.opdNo}</td>
              <td>{v.doctor ?? '—'}</td>
              <td>
                {v.diagnoses.length === 0
                  ? '—'
                  : v.diagnoses.map((d) => d.title).join(', ')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReportsTab() {
  const q = usePortal<PortalReport[]>('reports', '/portal/reports');
  if (q.isPending) return <p className="muted">Loading…</p>;
  if (q.error) return <Err error={q.error} fallback="Could not load your reports" />;
  if (!q.data?.length) {
    return (
      <p className="muted">
        No reports are ready yet. A report appears here once your doctor has
        finalised it.
      </p>
    );
  }

  return (
    <div>
      {q.data.map((r) => (
        <div className="card" key={r.id}>
          <h3>{r.serviceName}</h3>
          <p className="muted">
            {r.department} · finalised {r.reportedAt ? formatDateTime(r.reportedAt) : ''}
          </p>
          {r.impression && <p><strong>{r.impression}</strong></p>}
          {r.values.length > 0 && (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Test</th>
                    <th className="num">Result</th>
                    <th>Unit</th>
                    <th>Normal range</th>
                  </tr>
                </thead>
                <tbody>
                  {r.values.map((v, i) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <tr key={i}>
                      <td>{v.name}</td>
                      <td className="num">
                        {v.value}
                        {v.flag && v.flag !== 'normal' && (
                          <strong> ({v.flag})</strong>
                        )}
                      </td>
                      <td>{v.unit ?? '—'}</td>
                      <td>{v.referenceRange ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="muted">
            A result outside the normal range does not on its own mean anything is
            wrong. Discuss it with your doctor.
          </p>
        </div>
      ))}
    </div>
  );
}

function PrescriptionsTab() {
  const q = usePortal<PortalPrescription[]>('prescriptions', '/portal/prescriptions');
  if (q.isPending) return <p className="muted">Loading…</p>;
  if (q.error) return <Err error={q.error} fallback="Could not load your prescriptions" />;
  if (!q.data?.length) return <p className="muted">Nothing prescribed yet.</p>;

  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Prescribed</th>
            <th>Medicine</th>
            <th>Dose</th>
            <th>How often</th>
            <th>For</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          {q.data.map((p) => (
            <tr key={p.id}>
              <td>{formatDate(p.prescribedAt)}</td>
              <td>{p.drugName}</td>
              <td>{p.dose ?? '—'}</td>
              <td>{p.frequency ?? '—'}</td>
              <td>{p.durationDays ? `${p.durationDays} days` : '—'}</td>
              <td>{p.instructions ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BillsTab() {
  const q = usePortal<PortalBill[]>('bills', '/portal/bills');
  if (q.isPending) return <p className="muted">Loading…</p>;
  if (q.error) return <Err error={q.error} fallback="Could not load your bills" />;
  if (!q.data?.length) return <p className="muted">No bills yet.</p>;

  return (
    <div>
      {q.data.map((b) => (
        <div className="card" key={b.caseId}>
          <h3>{b.caseNo}</h3>
          <p className="muted">Opened {formatDate(b.openedAt)} · {b.status}</p>
          <p>
            Charged {formatMoney(b.chargedMinor)} · paid {formatMoney(b.paidMinor)} ·{' '}
            <strong>
              {b.balanceMinor > 0
                ? `${formatMoney(b.balanceMinor)} outstanding`
                : 'settled'}
            </strong>
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Date</th>
                  <th className="num">Qty</th>
                  <th className="num">Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {b.items.map((i) => (
                  <tr key={i.id}>
                    <td>{i.name}</td>
                    <td>{formatDate(i.chargedAt)}</td>
                    <td className="num">{i.quantity}</td>
                    <td className="num">{formatMoney(i.netMinor)}</td>
                    <td>{i.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

interface MyRequest {
  id: string;
  preferredDate: string;
  doctor: string | null;
  reason: string | null;
  status: string;
  declineReason: string | null;
}

function AppointmentsTab() {
  const queryClient = useQueryClient();
  const appts = usePortal<PortalAppointment[]>('appointments', '/portal/appointments');
  const reqs = usePortal<MyRequest[]>('requests', '/portal/appointment-requests');

  const [preferredDate, setPreferredDate] = useState(todayIsoDate());
  const [reason, setReason] = useState('');
  const [formErr, setFormErr] = useState<string | null>(null);

  const request = useMutation({
    mutationFn: async () => {
      const body = requestAppointmentSchema.parse({
        preferredDate,
        reason: reason.trim() || undefined,
      });
      await portalApi.post('/portal/appointment-requests', body);
    },
    onSuccess: async () => {
      setReason('');
      await queryClient.invalidateQueries({ queryKey: ['portal', 'requests'] });
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    const parsed = requestAppointmentSchema.safeParse({
      preferredDate,
      reason: reason.trim() || undefined,
    });
    if (!parsed.success) {
      setFormErr(zodMessage(parsed.error));
      return;
    }
    request.mutate();
  };

  return (
    <div>
      <form className="card" onSubmit={submit}>
        <h2>Ask for an appointment</h2>
        <p className="muted">
          This is a request, not a booking. The desk will confirm a time and let
          you know.
        </p>
        <label>
          Preferred date
          <input
            type="date"
            value={preferredDate}
            onChange={(e) => setPreferredDate(e.target.value)}
            required
          />
        </label>
        <label>
          What is it about?
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
        </label>
        {formErr && <div className="alert" role="alert">{formErr}</div>}
        <Err error={request.error} fallback="Could not send your request" />
        <button type="submit" disabled={request.isPending}>
          {request.isPending ? 'Sending…' : 'Send request'}
        </button>
      </form>

      <div className="card">
        <h3>Booked appointments</h3>
        {appts.isPending && <p className="muted">Loading…</p>}
        {!appts.data?.length && !appts.isPending && (
          <p className="muted">Nothing booked.</p>
        )}
        {!!appts.data?.length && (
          <ul>
            {appts.data.map((a) => (
              <li key={a.id}>
                {formatDateTime(a.scheduledAt)} — {a.doctor ?? 'to be assigned'} ({a.status})
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h3>Your requests</h3>
        {reqs.isPending && <p className="muted">Loading…</p>}
        {!reqs.data?.length && !reqs.isPending && (
          <p className="muted">No requests yet.</p>
        )}
        {!!reqs.data?.length && (
          <ul>
            {reqs.data.map((r) => (
              <li key={r.id}>
                {formatDate(r.preferredDate)} — <strong>{r.status}</strong>
                {r.declineReason && ` (${r.declineReason})`}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
