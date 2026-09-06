import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  OPD_STATUS_LABELS,
  VISIT_STAGE_LABELS,
  formatMoney,
  type OpdScope,
  type OpdVisitListItem,
  type OpdVisitStatus,
  type Practitioner,
} from '@hms/shared';
import { api } from '../lib/api';
import { useCan } from '../lib/permissions';
import { useDebounced } from '../lib/useDebounced';
import { formatDateTime, fullName } from '../lib/format';
import { ErrorNote, Loading } from '../components/QueryFeedback';
import { StatusBadge } from '../components/StatusBadge';
import { Tabs } from '../components/Tabs';

type ListScope = Extract<OpdScope, 'today' | 'upcoming' | 'past'>;

const SCOPES = [
  { value: 'today', label: 'Today' },
  { value: 'upcoming', label: 'Upcoming' },
  { value: 'past', label: 'Past' },
] as const satisfies readonly { value: ListScope; label: string }[];

const STATUSES: OpdVisitStatus[] = [
  'waiting',
  'in_consultation',
  'completed',
  'cancelled',
];

export function OpdListPage() {
  const can = useCan();
  const [scope, setScope] = useState<ListScope>('today');
  const [practitionerId, setPractitionerId] = useState('');
  const [status, setStatus] = useState<'' | OpdVisitStatus>('');
  const [q, setQ] = useState('');
  const debouncedQ = useDebounced(q);

  const practitioners = useQuery({
    queryKey: ['practitioners'],
    queryFn: async () => {
      const { data } = await api.get<Practitioner[]>('/practitioners');
      return data;
    },
  });

  const visits = useQuery({
    queryKey: ['opd', 'list', scope, practitionerId, status, debouncedQ],
    queryFn: async () => {
      const { data } = await api.get<OpdVisitListItem[]>('/opd', {
        params: {
          scope,
          practitionerId: practitionerId || undefined,
          status: status || undefined,
          q: debouncedQ || undefined,
        },
      });
      return data;
    },
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <div className="page-head">
        <h1>OPD</h1>
        {can('opd:create') && (
          <Link to="/opd/new">
            <button type="button">Register visit</button>
          </Link>
        )}
      </div>

      <Tabs tabs={SCOPES} value={scope} onChange={setScope} ariaLabel="Visit scope" />

      <div className="toolbar">
        <input
          className="grow"
          autoFocus
          placeholder="Search OPD no, patient name or MRN"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search visits"
        />
        <select
          value={practitionerId}
          onChange={(e) => setPractitionerId(e.target.value)}
          aria-label="Filter by practitioner"
          style={{ maxWidth: 260 }}
        >
          <option value="">All practitioners</option>
          {practitioners.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {fullName(p)}
              {p.specialty ? ` — ${p.specialty}` : ''}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as '' | OpdVisitStatus)}
          aria-label="Filter by status"
          style={{ maxWidth: 200 }}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {OPD_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      <ErrorNote error={practitioners.error} fallback="Could not load practitioners" />
      <ErrorNote error={visits.error} fallback="Could not load visits" />
      {visits.isPending && <Loading label="Loading visits…" />}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>OPD no</th>
              <th>Patient</th>
              <th>Practitioner</th>
              <th>Time</th>
              <th>Status</th>
              <th>Stage</th>
              <th className="num">Charged</th>
              <th className="num">Paid</th>
              <th className="num">Balance</th>
            </tr>
          </thead>
          <tbody>
            {visits.data?.map((v) => (
              <tr key={v.id}>
                <td>
                  <Link to={`/opd/${v.id}`}>{v.opdNo}</Link>
                  {v.isFollowUp && <span className="badge"> follow-up</span>}
                  {v.isAntenatal && <span className="badge"> antenatal</span>}
                </td>
                <td>
                  <Link to={`/patients/${v.patient.id}`}>
                    {v.patient.lastName}, {v.patient.firstName}
                  </Link>
                  <div className="muted">
                    {v.patient.mrn}
                    {v.patient.knownAllergies ? ' · allergies on file' : ''}
                  </div>
                </td>
                <td>{fullName(v.practitioner)}</td>
                <td>{formatDateTime(v.visitAt)}</td>
                <td>
                  <StatusBadge status={v.status} label={OPD_STATUS_LABELS[v.status]} />
                </td>
                <td>
                  <StatusBadge status={v.stage} label={VISIT_STAGE_LABELS[v.stage]} />
                </td>
                <td className="num">{formatMoney(v.netChargedMinor)}</td>
                <td className="num">{formatMoney(v.paidMinor)}</td>
                <td
                  className={`num ${v.balanceMinor > 0 ? 'balance-due' : 'balance-clear'}`}
                >
                  {formatMoney(v.balanceMinor)}
                </td>
              </tr>
            ))}
            {visits.data && visits.data.length === 0 && (
              <tr>
                <td colSpan={9} className="muted">
                  No visits in this view.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
