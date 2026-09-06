import { useEffect, useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  VISIT_STAGE_LABELS,
  formatAge,
  type OpdVisitListItem,
  type Practitioner,
} from '@hms/shared';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth-context';
import { useCan } from '../lib/permissions';
import { fullName, timeAgo } from '../lib/format';
import { ErrorNote, Loading } from '../components/QueryFeedback';
import { StatusBadge } from '../components/StatusBadge';

/**
 * The doctor's own dashboard: today's visits for one practitioner. `SessionUser`
 * carries no practitionerId, so the filter defaults to the first practitioner
 * whose name matches the signed-in user — and stays a visible, changeable select.
 */
export function DoctorQueuePage() {
  const can = useCan();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const practitioners = useQuery({
    queryKey: ['practitioners'],
    queryFn: async () => {
      const { data } = await api.get<Practitioner[]>('/practitioners');
      return data;
    },
  });

  const [practitionerId, setPractitionerId] = useState('');
  const [autoPicked, setAutoPicked] = useState(false);

  useEffect(() => {
    if (autoPicked || practitionerId || !practitioners.data || !user) return;
    const match = practitioners.data.find(
      (p) =>
        p.firstName.trim().toLowerCase() === user.firstName.trim().toLowerCase() &&
        p.lastName.trim().toLowerCase() === user.lastName.trim().toLowerCase(),
    );
    if (match) setPractitionerId(match.id);
    setAutoPicked(true);
  }, [practitioners.data, user, practitionerId, autoPicked]);

  const visits = useQuery({
    // Same response shape as OpdListPage — reuse its key family (OpdVisitListItem[]).
    queryKey: ['opd', 'list', 'today', practitionerId, '', ''],
    queryFn: async () => {
      const { data } = await api.get<OpdVisitListItem[]>('/opd', {
        params: {
          scope: 'today',
          practitionerId: practitionerId || undefined,
        },
      });
      return data;
    },
    placeholderData: keepPreviousData,
  });

  const startConsultation = useMutation({
    mutationFn: async (visitId: string) => {
      const { data } = await api.patch<OpdVisitListItem>(`/opd/${visitId}/status`, {
        status: 'in_consultation',
      });
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['opd', 'list'] });
      await queryClient.invalidateQueries({ queryKey: ['opd', 'visit'] });
    },
  });

  const rows = visits.data ?? [];

  return (
    <>
      <div className="page-head">
        <h1>My queue</h1>
        <Link to="/opd">Full OPD list</Link>
      </div>

      <div className="toolbar">
        <select
          className="grow"
          value={practitionerId}
          onChange={(e) => setPractitionerId(e.target.value)}
          aria-label="Doctor"
          style={{ maxWidth: 320 }}
        >
          <option value="">All practitioners</option>
          {practitioners.data?.map((p) => (
            <option key={p.id} value={p.id}>
              {fullName(p)}
              {p.specialty ? ` — ${p.specialty}` : ''}
            </option>
          ))}
        </select>
      </div>

      <ErrorNote error={practitioners.error} fallback="Could not load practitioners" />
      <ErrorNote error={visits.error} fallback="Could not load the queue" />
      <ErrorNote error={startConsultation.error} fallback="Could not start the consultation" />
      {visits.isPending && <Loading label="Loading queue…" />}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>OPD no</th>
              <th>Patient</th>
              <th>Waiting since</th>
              <th>Stage</th>
              <th className="no-print" />
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => {
              const allergy =
                v.patient.knownAllergies?.trim() ? v.patient.knownAllergies.trim() : '';
              return (
                <tr key={v.id}>
                  <td>
                    <Link to={`/opd/${v.id}`}>{v.opdNo}</Link>
                  </td>
                  <td>
                    {v.patient.lastName}, {v.patient.firstName}
                    <div className="muted">
                      {formatAge(v.patient.birthDate)}
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
                  <td>{timeAgo(v.visitAt)}</td>
                  <td>
                    <StatusBadge status={v.stage} label={VISIT_STAGE_LABELS[v.stage]} />
                  </td>
                  <td className="no-print">
                    <div className="row">
                      {can('opd:update') && v.status === 'waiting' && (
                        <button
                          type="button"
                          disabled={startConsultation.isPending}
                          onClick={() => startConsultation.mutate(v.id)}
                        >
                          Start consultation
                        </button>
                      )}
                      <Link to={`/opd/${v.id}`}>
                        <button type="button" className="secondary">
                          Open
                        </button>
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
            {visits.data && rows.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  No patients in this queue today.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
