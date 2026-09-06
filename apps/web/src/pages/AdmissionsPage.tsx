import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  ADMISSION_STATUS_LABELS,
  admissionStatusSchema,
  formatMoney,
  type AdmissionListItem,
  type AdmissionStatus,
  type Ward,
} from '@hms/shared';
import { api } from '../lib/api';
import { useCan } from '../lib/permissions';
import { useDebounced } from '../lib/useDebounced';
import { formatDateTime, fullName } from '../lib/format';
import { ErrorNote, Loading } from '../components/QueryFeedback';
import { StatusBadge } from '../components/StatusBadge';

const STATUSES = admissionStatusSchema.options;

export function AdmissionsPage() {
  const can = useCan();
  const [status, setStatus] = useState<'' | AdmissionStatus>('admitted');
  const [wardId, setWardId] = useState('');
  const [q, setQ] = useState('');
  const debouncedQ = useDebounced(q);

  const wards = useQuery({
    queryKey: ['wards', 'list'],
    queryFn: async () => {
      const { data } = await api.get<Ward[]>('/wards');
      return data;
    },
  });

  const admissions = useQuery({
    // AdmissionListItem[] — distinct from the ['admissions','detail',id] shape.
    queryKey: ['admissions', 'list', status, wardId, debouncedQ],
    queryFn: async () => {
      const { data } = await api.get<AdmissionListItem[]>('/admissions', {
        params: {
          status: status || undefined,
          wardId: wardId || undefined,
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
        <h1>Admissions</h1>
        {can('admission:create') && (
          <Link to="/admissions/new">
            <button type="button">Admit patient</button>
          </Link>
        )}
      </div>

      <div className="toolbar">
        <input
          className="grow"
          placeholder="Search admission no, patient name or MRN"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search admissions"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as '' | AdmissionStatus)}
          aria-label="Filter by status"
          style={{ maxWidth: 200 }}
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {ADMISSION_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          value={wardId}
          onChange={(e) => setWardId(e.target.value)}
          aria-label="Filter by ward"
          style={{ maxWidth: 240 }}
        >
          <option value="">All wards</option>
          {wards.data?.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
      </div>

      <ErrorNote error={wards.error} fallback="Could not load wards" />
      <ErrorNote error={admissions.error} fallback="Could not load admissions" />
      {admissions.isPending && <Loading label="Loading admissions…" />}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Admission no</th>
              <th>Patient</th>
              <th>Consultant</th>
              <th>Ward / bed</th>
              <th>Admitted</th>
              <th className="num">Nights</th>
              <th className="num">Balance</th>
            </tr>
          </thead>
          <tbody>
            {admissions.data?.map((a) => {
              const allergy = a.patient.knownAllergies?.trim() ?? '';
              return (
                <tr key={a.id}>
                  <td>
                    <Link to={`/admissions/${a.id}`}>{a.admissionNo}</Link>
                    {a.status !== 'admitted' && (
                      <div>
                        <StatusBadge
                          status={a.status}
                          label={ADMISSION_STATUS_LABELS[a.status]}
                        />
                      </div>
                    )}
                  </td>
                  <td>
                    <Link to={`/patients/${a.patient.id}`}>
                      {a.patient.lastName}, {a.patient.firstName}
                    </Link>
                    <div className="muted">
                      {a.patient.mrn}
                      {allergy ? (
                        <>
                          {' · '}
                          <span className="badge badge-flag-high" title={allergy}>
                            Allergy
                          </span>
                        </>
                      ) : (
                        ''
                      )}
                    </div>
                  </td>
                  <td>{fullName(a.practitioner)}</td>
                  <td>
                    {a.currentBed ? (
                      <>
                        {a.currentBed.wardName}
                        <div className="muted">
                          {a.currentBed.bedName} · {a.currentBed.floorName}
                        </div>
                      </>
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>{formatDateTime(a.admittedAt)}</td>
                  <td className="num">{a.nights}</td>
                  <td
                    className={`num ${
                      a.balanceMinor > 0 ? 'balance-due' : 'balance-clear'
                    }`}
                  >
                    {formatMoney(a.balanceMinor)}
                  </td>
                </tr>
              );
            })}
            {admissions.data && admissions.data.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  No admissions in this view.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
