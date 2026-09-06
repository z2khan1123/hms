import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type {
  Appointment,
  AppointmentStatus,
  Paginated,
  Patient,
  Practitioner,
} from '@hms/shared';
import { api, apiErrorMessage } from '../lib/api';

const NEXT_STATUSES: AppointmentStatus[] = [
  'arrived',
  'fulfilled',
  'cancelled',
  'noshow',
];

function fmt(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function AppointmentsPage() {
  const queryClient = useQueryClient();

  const appointments = useQuery({
    queryKey: ['appointments'],
    queryFn: async () => {
      const { data } = await api.get<Appointment[]>('/appointments');
      return data;
    },
  });

  const practitioners = useQuery({
    queryKey: ['practitioners'],
    queryFn: async () => {
      const { data } = await api.get<Practitioner[]>('/practitioners');
      return data;
    },
  });

  const patients = useQuery({
    // Distinct from the paginated ['patients', q, page] list query — this one
    // returns a flat array for name lookup, so it must not share a cache key.
    queryKey: ['patients', 'lookup'],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Patient>>('/patients', {
        params: { pageSize: 100 },
      });
      return data.data;
    },
  });

  const practitionerName = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of practitioners.data ?? [])
      map.set(p.id, `${p.lastName}, ${p.firstName}`);
    return map;
  }, [practitioners.data]);

  const patientName = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of patients.data ?? [])
      map.set(p.id, `${p.lastName}, ${p.firstName} (${p.mrn})`);
    return map;
  }, [patients.data]);

  const setStatus = useMutation({
    mutationFn: async (input: { id: string; status: AppointmentStatus }) => {
      await api.patch(`/appointments/${input.id}/status`, {
        status: input.status,
      });
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['appointments'] }),
  });

  return (
    <>
      <div className="page-head">
        <h1>Appointments</h1>
        <Link to="/appointments/new">
          <button>Book appointment</button>
        </Link>
      </div>

      {appointments.isError && (
        <div className="alert">{apiErrorMessage(appointments.error)}</div>
      )}
      {setStatus.isError && (
        <div className="alert">{apiErrorMessage(setStatus.error)}</div>
      )}

      <table>
        <thead>
          <tr>
            <th>When</th>
            <th>Patient</th>
            <th>Practitioner</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {appointments.data?.map((a) => (
            <tr key={a.id}>
              <td>
                {fmt(a.startsAt)}
                <span className="muted"> – {fmt(a.endsAt)}</span>
              </td>
              <td>{patientName.get(a.patientId) ?? a.patientId}</td>
              <td>{practitionerName.get(a.practitionerId) ?? a.practitionerId}</td>
              <td>
                <span className="badge">{a.status}</span>
              </td>
              <td>
                <div className="row-actions">
                  {NEXT_STATUSES.filter((s) => s !== a.status).map((s) => (
                    <button
                      key={s}
                      className="secondary"
                      disabled={setStatus.isPending}
                      onClick={() => setStatus.mutate({ id: a.id, status: s })}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </td>
            </tr>
          ))}
          {appointments.data && appointments.data.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                No appointments yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </>
  );
}
