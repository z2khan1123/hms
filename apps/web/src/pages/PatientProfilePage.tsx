import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import {
  CASE_STATUS_LABELS,
  OPD_STATUS_LABELS,
  formatMoney,
  type Case,
  type OpdVisitListItem,
  type Patient,
} from '@hms/shared';
import { api } from '../lib/api';
import { useCan } from '../lib/permissions';
import { formatDate, formatDateTime, fullName } from '../lib/format';
import { PatientHeader } from '../components/PatientHeader';
import { ErrorNote, Loading } from '../components/QueryFeedback';
import { StatusBadge } from '../components/StatusBadge';
import { Tabs } from '../components/Tabs';

type TabKey = 'overview' | 'cases' | 'visits';

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'cases', label: 'Cases' },
  { value: 'visits', label: 'Visits' },
] as const satisfies readonly { value: TabKey; label: string }[];

export function PatientProfilePage() {
  const { id = '' } = useParams();
  const can = useCan();
  const [tab, setTab] = useState<TabKey>('overview');

  const patient = useQuery({
    queryKey: ['patient', 'detail', id],
    queryFn: async () => {
      const { data } = await api.get<Patient>(`/patients/${id}`);
      return data;
    },
    enabled: Boolean(id),
  });

  const cases = useQuery({
    queryKey: ['cases', 'byPatient', id],
    queryFn: async () => {
      const { data } = await api.get<Case[]>('/cases', { params: { patientId: id } });
      return data;
    },
    enabled: Boolean(id) && tab === 'cases',
  });

  const visits = useQuery({
    queryKey: ['opd', 'list', 'all', 'patient', id],
    queryFn: async () => {
      const { data } = await api.get<OpdVisitListItem[]>('/opd', {
        params: { scope: 'all', patientId: id },
      });
      return data;
    },
    enabled: Boolean(id) && tab === 'visits',
  });

  if (patient.isPending) return <Loading label="Loading patient…" />;
  if (patient.isError)
    return <ErrorNote error={patient.error} fallback="Could not load this patient" />;
  if (!patient.data) return null;

  const p = patient.data;

  return (
    <>
      <PatientHeader
        patient={p}
        linkToProfile={false}
        actions={
          <>
            {can('opd:create') && (
              <Link to={`/opd/new?patientId=${p.id}`}>
                <button type="button">Register visit</button>
              </Link>
            )}
            {can('patient:update') && (
              <Link to={`/patients/${p.id}/edit`}>
                <button type="button" className="secondary">
                  Edit
                </button>
              </Link>
            )}
          </>
        }
      />

      <div style={{ marginTop: 16 }}>
        <Tabs tabs={TABS} value={tab} onChange={setTab} ariaLabel="Patient sections" />
      </div>

      {tab === 'overview' && (
        <div className="split">
          <div className="card">
            <div className="section">
              <h2>Demographics</h2>
              <dl className="kv">
                <dt>MRN</dt>
                <dd>{p.mrn}</dd>
                <dt>Name</dt>
                <dd>
                  {p.firstName} {p.lastName}
                </dd>
                <dt>Guardian</dt>
                <dd>{p.guardianName ?? '—'}</dd>
                <dt>Gender</dt>
                <dd>{p.gender}</dd>
                <dt>Date of birth</dt>
                <dd>{formatDate(p.birthDate)}</dd>
                <dt>Marital status</dt>
                <dd>{p.maritalStatus ?? '—'}</dd>
                <dt>Blood group</dt>
                <dd>{p.bloodType ?? '—'}</dd>
                <dt>CNIC</dt>
                <dd>{p.nationalIdLast4 ? `•••••-•••••••-${p.nationalIdLast4}` : '—'}</dd>
                <dt>Phone</dt>
                <dd>{p.phone}</dd>
                <dt>Alternate phone</dt>
                <dd>{p.alternatePhone ?? '—'}</dd>
                <dt>Email</dt>
                <dd>{p.email ?? '—'}</dd>
                <dt>Address</dt>
                <dd>
                  {p.address
                    ? [
                        p.address.line1,
                        p.address.line2,
                        p.address.city,
                        p.address.province,
                        p.address.postalCode,
                        p.address.country,
                      ]
                        .filter(Boolean)
                        .join(', ')
                    : '—'}
                </dd>
                <dt>Status</dt>
                <dd>
                  <StatusBadge status={p.status} />
                </dd>
                <dt>Registered</dt>
                <dd>{formatDateTime(p.createdAt)}</dd>
              </dl>
            </div>

            <div className="section">
              <h2>Remarks</h2>
              <p className={p.remarks ? undefined : 'muted'}>{p.remarks ?? 'None.'}</p>
            </div>
          </div>

          <div className="card">
            <div className="section">
              <h2>Payer / TPA</h2>
              {p.tpa ? (
                <dl className="kv" style={{ gridTemplateColumns: '120px 1fr' }}>
                  <dt>TPA</dt>
                  <dd>
                    {p.tpa.name}
                    {p.tpa.code ? ` (${p.tpa.code})` : ''}
                  </dd>
                  <dt>Member ID</dt>
                  <dd>{p.tpaMemberId ?? '—'}</dd>
                  <dt>Valid till</dt>
                  <dd>{p.tpaValidTill ? formatDate(p.tpaValidTill) : '—'}</dd>
                </dl>
              ) : (
                <p className="muted">Self-paying — no panel on file.</p>
              )}
            </div>

            <div className="section">
              <h2>Known allergies</h2>
              <p className={p.knownAllergies ? undefined : 'muted'}>
                {p.knownAllergies ?? 'None recorded.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {tab === 'cases' && (
        <>
          <ErrorNote error={cases.error} fallback="Could not load cases" />
          {cases.isPending && <Loading />}
          {cases.data && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Case no</th>
                    <th>Status</th>
                    <th>Opened</th>
                    <th>Visits</th>
                    <th className="num">Charged</th>
                    <th className="num">Paid</th>
                    <th className="num">Balance</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {cases.data.map((c) => (
                    <tr key={c.id}>
                      <td>{c.caseNo}</td>
                      <td>
                        <StatusBadge status={c.status} label={CASE_STATUS_LABELS[c.status]} />
                      </td>
                      <td>{formatDateTime(c.openedAt)}</td>
                      <td>{c.visitCount}</td>
                      <td className="num">{formatMoney(c.balance.chargedMinor)}</td>
                      <td className="num">{formatMoney(c.balance.paidMinor)}</td>
                      <td
                        className={`num ${c.balance.balanceMinor > 0 ? 'balance-due' : 'balance-clear'}`}
                      >
                        {formatMoney(c.balance.balanceMinor)}
                      </td>
                      <td>
                        <Link to={`/cases/${c.id}/billing`}>Billing</Link>
                      </td>
                    </tr>
                  ))}
                  {cases.data.length === 0 && (
                    <tr>
                      <td colSpan={8} className="muted">
                        No cases yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'visits' && (
        <>
          <ErrorNote error={visits.error} fallback="Could not load visits" />
          {visits.isPending && <Loading />}
          {visits.data && (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>OPD no</th>
                    <th>When</th>
                    <th>Practitioner</th>
                    <th>Case</th>
                    <th>Status</th>
                    <th className="num">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {visits.data.map((v) => (
                    <tr key={v.id}>
                      <td>
                        <Link to={`/opd/${v.id}`}>{v.opdNo}</Link>
                      </td>
                      <td>{formatDateTime(v.visitAt)}</td>
                      <td>{fullName(v.practitioner)}</td>
                      <td>{v.caseNo}</td>
                      <td>
                        <StatusBadge status={v.status} label={OPD_STATUS_LABELS[v.status]} />
                      </td>
                      <td className="num">{formatMoney(v.balanceMinor)}</td>
                    </tr>
                  ))}
                  {visits.data.length === 0 && (
                    <tr>
                      <td colSpan={6} className="muted">
                        No visits yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
