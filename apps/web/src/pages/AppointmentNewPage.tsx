import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import type { Paginated, Patient, Practitioner } from '@hms/shared';
import { api, apiErrorMessage } from '../lib/api';

const DURATIONS = [15, 30, 45, 60];

export function AppointmentNewPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);

  const [patientId, setPatientId] = useState('');
  const [practitionerId, setPractitionerId] = useState('');
  const [startsLocal, setStartsLocal] = useState('');
  const [durationMin, setDurationMin] = useState(30);
  const [reason, setReason] = useState('');

  const patients = useQuery({
    queryKey: ['patients', '', 1],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Patient>>('/patients', {
        params: { pageSize: 100 },
      });
      return data.data;
    },
  });

  const practitioners = useQuery({
    queryKey: ['practitioners'],
    queryFn: async () => {
      const { data } = await api.get<Practitioner[]>('/practitioners');
      return data;
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const start = new Date(startsLocal);
      const end = new Date(start.getTime() + durationMin * 60_000);
      await api.post('/appointments', {
        patientId,
        practitionerId,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        reason: reason || undefined,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['appointments'] });
      navigate('/appointments');
    },
    onError: (err) => setError(apiErrorMessage(err)),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!patientId || !practitionerId || !startsLocal) {
      setError('Patient, practitioner and start time are required.');
      return;
    }
    mutation.mutate();
  }

  return (
    <>
      <div className="page-head">
        <h1>Book appointment</h1>
        <Link to="/appointments">Back to list</Link>
      </div>

      <div className="card">
        {error && <div className="alert">{error}</div>}
        <form onSubmit={onSubmit}>
          <div className="field">
            <label>Patient</label>
            <select
              value={patientId}
              onChange={(e) => setPatientId(e.target.value)}
            >
              <option value="">Select a patient…</option>
              {patients.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.lastName}, {p.firstName} ({p.mrn})
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label>Practitioner</label>
            <select
              value={practitionerId}
              onChange={(e) => setPractitionerId(e.target.value)}
            >
              <option value="">Select a practitioner…</option>
              {practitioners.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.lastName}, {p.firstName}
                  {p.specialty ? ` — ${p.specialty}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div className="form-grid">
            <div className="field">
              <label>Start</label>
              <input
                type="datetime-local"
                value={startsLocal}
                onChange={(e) => setStartsLocal(e.target.value)}
              />
            </div>
            <div className="field">
              <label>Duration</label>
              <select
                value={durationMin}
                onChange={(e) => setDurationMin(Number(e.target.value))}
              >
                {DURATIONS.map((d) => (
                  <option key={d} value={d}>
                    {d} minutes
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label>Reason (optional)</label>
            <input value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>

          <button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Booking…' : 'Book appointment'}
          </button>
        </form>
      </div>
    </>
  );
}
