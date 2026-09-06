import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  admitPatientSchema,
  type Admission,
  type AdmitPatientInput,
  type Bed,
  type Patient,
  type Practitioner,
} from '@hms/shared';
import { api } from '../lib/api';
import { useCan } from '../lib/permissions';
import {
  blankToUndefined,
  fullName,
  localInputToIso,
  toLocalInput,
} from '../lib/format';
import { ErrorNote, Loading } from '../components/QueryFeedback';
import { PatientHeader } from '../components/PatientHeader';
import { PatientPicker } from '../components/PatientPicker';

export function AdmitPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const can = useCan();
  const [params] = useSearchParams();
  const preselectedPatientId = params.get('patientId') ?? '';
  const preselectedBedId = params.get('bedId') ?? '';
  const fromOpdVisitId = params.get('fromOpdVisitId') ?? '';

  const [patient, setPatient] = useState<Patient | null>(null);
  const [practitionerId, setPractitionerId] = useState('');
  const [bedId, setBedId] = useState(preselectedBedId);
  const [admittedAtLocal, setAdmittedAtLocal] = useState(() =>
    toLocalInput(new Date()),
  );
  const [provisionalDiagnosis, setProvisionalDiagnosis] = useState('');
  const [admissionNote, setAdmissionNote] = useState('');
  const [issues, setIssues] = useState<string[]>([]);

  const preselectedPatient = useQuery({
    queryKey: ['patient', 'detail', preselectedPatientId],
    queryFn: async () => {
      const { data } = await api.get<Patient>(`/patients/${preselectedPatientId}`);
      return data;
    },
    enabled: Boolean(preselectedPatientId),
  });

  useEffect(() => {
    if (preselectedPatient.data) setPatient(preselectedPatient.data);
  }, [preselectedPatient.data]);

  const practitioners = useQuery({
    queryKey: ['practitioners'],
    queryFn: async () => {
      const { data } = await api.get<Practitioner[]>('/practitioners');
      return data;
    },
  });

  const beds = useQuery({
    // Bed[] filtered to selectable (available) beds — its own key.
    queryKey: ['wards', 'beds', 'all', 'available', false],
    queryFn: async () => {
      const { data } = await api.get<Bed[]>('/wards/beds', {
        params: { status: 'available' },
      });
      return data;
    },
  });

  // Group the available beds by ward for a scannable <optgroup> list.
  const bedGroups = useMemo(() => {
    const groups = new Map<string, { wardName: string; floorName: string; beds: Bed[] }>();
    for (const bed of beds.data ?? []) {
      const key = bed.ward.id;
      const group = groups.get(key) ?? {
        wardName: bed.ward.name,
        floorName: bed.ward.floor.name,
        beds: [],
      };
      group.beds.push(bed);
      groups.set(key, group);
    }
    return [...groups.values()].sort((a, b) => a.wardName.localeCompare(b.wardName));
  }, [beds.data]);

  // The bed picked from the board may not be in the "available" list if it was
  // taken meanwhile — keep it visible so the field is never silently blank.
  const preselectedBed = useMemo(
    () => (beds.data ?? []).find((b) => b.id === preselectedBedId),
    [beds.data, preselectedBedId],
  );

  const admit = useMutation({
    mutationFn: async (payload: AdmitPatientInput) => {
      const { data } = await api.post<Admission>('/admissions', payload);
      return data;
    },
    onSuccess: async (admission) => {
      await queryClient.invalidateQueries({ queryKey: ['admissions'] });
      await queryClient.invalidateQueries({ queryKey: ['wards'] });
      navigate(`/admissions/${admission.id}`);
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setIssues([]);
    if (!patient) {
      setIssues(['Select a patient first.']);
      return;
    }
    const payload = {
      patientId: patient.id,
      fromOpdVisitId: fromOpdVisitId || undefined,
      practitionerId,
      bedId,
      admittedAt: admittedAtLocal ? localInputToIso(admittedAtLocal) : undefined,
      provisionalDiagnosis: blankToUndefined(provisionalDiagnosis),
      admissionNote: blankToUndefined(admissionNote),
    };
    const parsed = admitPatientSchema.safeParse(payload);
    if (!parsed.success) {
      setIssues(
        parsed.error.issues.map((i) =>
          i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message,
        ),
      );
      return;
    }
    admit.mutate(parsed.data);
  }

  if (!can('admission:create')) {
    return <p className="muted">You do not have permission to admit patients.</p>;
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="page-head">
        <h1>Admit patient</h1>
        <Link to="/admissions">Back to admissions</Link>
      </div>

      {issues.length > 0 && (
        <div className="alert" role="alert">
          <strong>Check the form:</strong>
          <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}
      {/* A 409 (bed taken since the form opened) surfaces here; the form keeps its values. */}
      <ErrorNote error={admit.error} fallback="Could not admit the patient" />
      <ErrorNote error={preselectedPatient.error} fallback="Could not load that patient" />

      <div className="card">
        <div className="section">
          <h2>Patient</h2>
          {preselectedPatient.isPending && preselectedPatientId && <Loading />}
          {patient ? (
            <>
              <PatientHeader patient={patient} />
              <div className="row" style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setPatient(null)}
                >
                  Change patient
                </button>
              </div>
            </>
          ) : (
            <PatientPicker onSelect={setPatient} autoFocus />
          )}
        </div>

        <div className="section">
          <h2>Admission</h2>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="practitionerId">Consultant</label>
              <select
                id="practitionerId"
                value={practitionerId}
                onChange={(e) => setPractitionerId(e.target.value)}
              >
                <option value="">Select a practitioner…</option>
                {practitioners.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {fullName(p)}
                    {p.specialty ? ` — ${p.specialty}` : ''}
                  </option>
                ))}
              </select>
              <ErrorNote
                error={practitioners.error}
                fallback="Could not load practitioners"
              />
            </div>
            <div className="field">
              <label htmlFor="bedId">Bed</label>
              <select
                id="bedId"
                value={bedId}
                onChange={(e) => setBedId(e.target.value)}
              >
                <option value="">Select an available bed…</option>
                {preselectedBed && (
                  <option value={preselectedBed.id}>
                    {preselectedBed.ward.name} — {preselectedBed.name} (
                    {preselectedBed.bedType.name})
                  </option>
                )}
                {bedGroups.map((group) => (
                  <optgroup
                    key={group.wardName}
                    label={`${group.wardName} · ${group.floorName}`}
                  >
                    {group.beds
                      .filter((b) => b.id !== preselectedBed?.id)
                      .map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name} ({b.bedType.name})
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
              <ErrorNote error={beds.error} fallback="Could not load beds" />
              <span className="hint">Only available beds can be picked.</span>
            </div>
            <div className="field">
              <label htmlFor="admittedAt">Admitted at</label>
              <input
                id="admittedAt"
                type="datetime-local"
                value={admittedAtLocal}
                onChange={(e) => setAdmittedAtLocal(e.target.value)}
              />
            </div>
          </div>

          <div className="field">
            <label htmlFor="provisionalDiagnosis">Provisional diagnosis</label>
            <textarea
              id="provisionalDiagnosis"
              value={provisionalDiagnosis}
              onChange={(e) => setProvisionalDiagnosis(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="admissionNote">Admission note</label>
            <textarea
              id="admissionNote"
              value={admissionNote}
              onChange={(e) => setAdmissionNote(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        <button type="submit" disabled={admit.isPending || !patient}>
          {admit.isPending ? 'Admitting…' : 'Admit patient'}
        </button>
        <Link to="/admissions">
          <button type="button" className="secondary">
            Cancel
          </button>
        </Link>
      </div>
    </form>
  );
}
