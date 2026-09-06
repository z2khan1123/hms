import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import {
  OPD_STATUS_LABELS,
  flagFor,
  formatMoney,
  recordVitalsSchema,
  updateOpdVisitSchema,
  type OpdVisit,
  type OpdVisitStatus,
  type Practitioner,
  type UpdateOpdVisitInput,
  type VitalReading,
  type VitalType,
} from '@hms/shared';
import { api } from '../lib/api';
import { useCan } from '../lib/permissions';
import { blankToUndefined, formatDateTime, fullName } from '../lib/format';
import { DiagnosisEditor, type DiagnosisDraft } from '../components/DiagnosisEditor';
import { ErrorNote, Loading } from '../components/QueryFeedback';
import { PatientHeader } from '../components/PatientHeader';
import { StatusBadge } from '../components/StatusBadge';
import { VisitTermEditor, type TermDraft } from '../components/VisitTermEditor';

function toTermDrafts(
  rows: { title: string; detail: string | null; refId: string | null }[],
): TermDraft[] {
  return rows.map((r) => ({
    refId: r.refId ?? undefined,
    title: r.title,
    detail: r.detail ?? undefined,
  }));
}

export function OpdVisitPage() {
  const { id = '' } = useParams();
  const can = useCan();
  const queryClient = useQueryClient();

  const visit = useQuery({
    // Detail shape — distinct from the ['opd','list',…] list-item queries.
    queryKey: ['opd', 'visit', id],
    queryFn: async () => {
      const { data } = await api.get<OpdVisit>(`/opd/${id}`);
      return data;
    },
    enabled: Boolean(id),
  });

  const practitioners = useQuery({
    queryKey: ['practitioners'],
    queryFn: async () => {
      const { data } = await api.get<Practitioner[]>('/practitioners');
      return data;
    },
  });

  // --- consultation editors ------------------------------------------------
  const [practitionerId, setPractitionerId] = useState('');
  const [symptoms, setSymptoms] = useState<TermDraft[]>([]);
  const [findings, setFindings] = useState<TermDraft[]>([]);
  const [diagnoses, setDiagnoses] = useState<DiagnosisDraft[]>([]);
  const [note, setNote] = useState('');
  const [previousMedicalIssue, setPreviousMedicalIssue] = useState('');
  const [knownAllergies, setKnownAllergies] = useState('');
  const [issues, setIssues] = useState<string[]>([]);

  useEffect(() => {
    const v = visit.data;
    if (!v) return;
    setPractitionerId(v.practitioner.id);
    setSymptoms(
      toTermDrafts(
        v.symptoms.map((s) => ({
          title: s.title,
          detail: s.detail,
          refId: s.symptomId,
        })),
      ),
    );
    setFindings(
      toTermDrafts(
        v.findings.map((f) => ({
          title: f.title,
          detail: f.detail,
          refId: f.findingId,
        })),
      ),
    );
    setDiagnoses(
      v.diagnoses.map((d) => ({
        icd10CodeId: d.icd10Code.id,
        code: d.icd10Code.code,
        title: d.icd10Code.title,
        isPrimary: d.isPrimary,
        note: d.note ?? undefined,
      })),
    );
    setNote(v.note ?? '');
    setPreviousMedicalIssue(v.previousMedicalIssue ?? '');
    setKnownAllergies(v.knownAllergies ?? '');
  }, [visit.data]);

  const save = useMutation({
    mutationFn: async (payload: UpdateOpdVisitInput) => {
      const { data } = await api.patch<OpdVisit>(`/opd/${id}`, payload);
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['opd', 'visit', id] });
      await queryClient.invalidateQueries({ queryKey: ['opd', 'list'] });
    },
  });

  const setStatus = useMutation({
    mutationFn: async (input: { status: OpdVisitStatus; reason?: string }) => {
      const { data } = await api.patch<OpdVisit>(`/opd/${id}/status`, input);
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['opd', 'visit', id] });
      await queryClient.invalidateQueries({ queryKey: ['opd', 'list'] });
    },
  });

  function onSave(event: FormEvent) {
    event.preventDefault();
    setIssues([]);
    const payload = {
      practitionerId: practitionerId || undefined,
      note: blankToUndefined(note),
      previousMedicalIssue: blankToUndefined(previousMedicalIssue),
      knownAllergies: blankToUndefined(knownAllergies),
      symptoms: symptoms.map((s) => ({
        symptomId: s.refId,
        title: s.title,
        detail: blankToUndefined(s.detail),
      })),
      findings: findings.map((f) => ({
        findingId: f.refId,
        title: f.title,
        detail: blankToUndefined(f.detail),
      })),
      diagnoses: diagnoses.map((d) => ({
        icd10CodeId: d.icd10CodeId,
        isPrimary: d.isPrimary,
        note: blankToUndefined(d.note),
      })),
    };
    const parsed = updateOpdVisitSchema.safeParse(payload);
    if (!parsed.success) {
      setIssues(
        parsed.error.issues.map((i) =>
          i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message,
        ),
      );
      return;
    }
    save.mutate(parsed.data);
  }

  // --- cancel with a reason ---------------------------------------------------
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  if (visit.isPending) return <Loading label="Loading visit…" />;
  if (visit.isError)
    return <ErrorNote error={visit.error} fallback="Could not load this visit" />;
  if (!visit.data) return null;

  const v = visit.data;
  const canEdit = can('opd:update') && v.status !== 'cancelled' && v.status !== 'completed';
  const allergyText = v.knownAllergies?.trim() || v.patient.knownAllergies?.trim() || '';

  return (
    <>
      <div className="page-head">
        <h1>OPD visit {v.opdNo}</h1>
        <Link to="/opd">Back to OPD list</Link>
      </div>

      {allergyText && (
        <div className="allergy-alert" role="alert">
          <span className="allergy-alert-tag">Allergy alert</span>
          <span>{allergyText}</span>
        </div>
      )}

      {/* The full-width alert above already carries the allergy warning. */}
      <PatientHeader
        patient={v.patient}
        allergies={v.knownAllergies}
        showAllergyBanner={false}
      />

      <div className="card">
        <div className="section">
          <h2>Visit</h2>
          <dl className="kv">
            <dt>OPD no</dt>
            <dd>{v.opdNo}</dd>
            <dt>Case no</dt>
            <dd>
              <Link to={`/cases/${v.caseId}/billing`}>{v.caseNo}</Link>
            </dd>
            <dt>Practitioner</dt>
            <dd>{fullName(v.practitioner)}</dd>
            <dt>Time</dt>
            <dd>{formatDateTime(v.visitAt)}</dd>
            <dt>Status</dt>
            <dd>
              <StatusBadge status={v.status} label={OPD_STATUS_LABELS[v.status]} />
            </dd>
            <dt>Case balance</dt>
            <dd className={v.caseBalance.balanceMinor > 0 ? 'balance-due' : 'balance-clear'}>
              {formatMoney(v.caseBalance.balanceMinor)}
            </dd>
          </dl>

          <div className="row no-print" style={{ marginTop: 12 }}>
            {can('opd:update') && v.status === 'waiting' && (
              <button
                type="button"
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate({ status: 'in_consultation' })}
              >
                Start consultation
              </button>
            )}
            {can('opd:update') && v.status === 'in_consultation' && (
              <button
                type="button"
                disabled={setStatus.isPending}
                onClick={() => setStatus.mutate({ status: 'completed' })}
              >
                Complete visit
              </button>
            )}
            {can('opd:cancel') &&
              v.status !== 'cancelled' &&
              v.status !== 'completed' &&
              !cancelling && (
                <button
                  type="button"
                  className="danger"
                  onClick={() => setCancelling(true)}
                >
                  Cancel visit
                </button>
              )}
          </div>

          {cancelling && (
            <div className="row no-print" style={{ marginTop: 10 }}>
              <input
                placeholder="Reason for cancellation"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                aria-label="Cancellation reason"
                style={{ maxWidth: 360 }}
              />
              <button
                type="button"
                className="danger"
                disabled={setStatus.isPending}
                onClick={() =>
                  setStatus.mutate(
                    {
                      status: 'cancelled',
                      reason: cancelReason.trim() || undefined,
                    },
                    { onSuccess: () => setCancelling(false) },
                  )
                }
              >
                Confirm cancellation
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setCancelling(false);
                  setCancelReason('');
                }}
              >
                Keep visit
              </button>
            </div>
          )}
          <ErrorNote error={setStatus.error} fallback="Could not change the visit status" />
        </div>
      </div>

      <form onSubmit={onSave} noValidate>
        <div className="card">
          <div className="section">
            <h2>Consultation</h2>

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
            <ErrorNote error={save.error} fallback="Could not save the consultation" />

            <div className="field">
              <label htmlFor="practitionerId">Consultant doctor</label>
              <select
                id="practitionerId"
                value={practitionerId}
                disabled={!canEdit}
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
          </div>

          <div className="section">
            <h2>Symptoms</h2>
            <VisitTermEditor
              label="Symptoms"
              vocabulary="symptoms"
              items={symptoms}
              onChange={setSymptoms}
              disabled={!canEdit}
            />
          </div>

          <div className="section">
            <h2>Findings</h2>
            <VisitTermEditor
              label="Findings"
              vocabulary="findings"
              items={findings}
              onChange={setFindings}
              disabled={!canEdit}
            />
          </div>

          <div className="section">
            <h2>Diagnoses</h2>
            <DiagnosisEditor items={diagnoses} onChange={setDiagnoses} disabled={!canEdit} />
          </div>

          <div className="section">
            <h2>Notes</h2>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="knownAllergies">Known allergies</label>
                <textarea
                  id="knownAllergies"
                  value={knownAllergies}
                  disabled={!canEdit}
                  onChange={(e) => setKnownAllergies(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="previousMedicalIssue">Previous medical issue</label>
                <textarea
                  id="previousMedicalIssue"
                  value={previousMedicalIssue}
                  disabled={!canEdit}
                  onChange={(e) => setPreviousMedicalIssue(e.target.value)}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="note">Consultation note</label>
              <textarea
                id="note"
                value={note}
                disabled={!canEdit}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
          </div>

          {canEdit && (
            <div className="row no-print" style={{ marginTop: 4 }}>
              <button type="submit" disabled={save.isPending}>
                {save.isPending ? 'Saving…' : 'Save consultation'}
              </button>
              {save.isSuccess && <span className="muted">Saved.</span>}
            </div>
          )}
        </div>
      </form>

      <VitalsPanel
        patientId={v.patient.id}
        caseId={v.caseId}
        opdVisitId={v.id}
        canRecord={can('vital:create') && v.status !== 'cancelled'}
      />
    </>
  );
}

// ---------------------------------------------------------------------------
// Vitals
// ---------------------------------------------------------------------------

const FLAG_LABEL: Record<'low' | 'normal' | 'high', string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
};

function VitalsPanel({
  patientId,
  caseId,
  opdVisitId,
  canRecord,
}: {
  patientId: string;
  caseId: string;
  opdVisitId: string;
  canRecord: boolean;
}) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<Record<string, string>>({});
  const [issue, setIssue] = useState<string | null>(null);

  const types = useQuery({
    queryKey: ['vitals', 'types'],
    queryFn: async () => {
      const { data } = await api.get<VitalType[]>('/vitals/types');
      return data;
    },
  });

  const readings = useQuery({
    // Distinct shape from ['vitals','types'] — the recorded readings for this visit.
    queryKey: ['vitals', 'readings', opdVisitId],
    queryFn: async () => {
      const { data } = await api.get<VitalReading[]>('/vitals', {
        params: { opdVisitId },
      });
      return data;
    },
    enabled: Boolean(opdVisitId),
  });

  const record = useMutation({
    mutationFn: async () => {
      const list = (types.data ?? [])
        .map((t) => ({ vitalTypeId: t.id, value: Number(values[t.id]) }))
        .filter((r) => values[r.vitalTypeId]?.trim() && Number.isFinite(r.value));
      const parsed = recordVitalsSchema.safeParse({
        patientId,
        caseId,
        opdVisitId,
        readings: list,
      });
      if (!parsed.success) {
        throw new Error(
          parsed.error.issues[0]?.message ?? 'Enter at least one valid reading.',
        );
      }
      const { data } = await api.post('/vitals', parsed.data);
      return data;
    },
    onSuccess: async () => {
      setValues({});
      setIssue(null);
      await queryClient.invalidateQueries({ queryKey: ['vitals', 'readings', opdVisitId] });
    },
    onError: (err) => setIssue(err instanceof Error ? err.message : 'Could not record vitals'),
  });

  const activeTypes = useMemo(
    () => (types.data ?? []).filter((t) => t.isActive),
    [types.data],
  );

  return (
    <div className="card">
      <div className="section">
        <h2>Vitals</h2>
        <ErrorNote error={types.error} fallback="Could not load vital types" />
        {types.isPending && <Loading label="Loading vital types…" />}

        {readings.data && readings.data.length > 0 && (
          <div className="table-wrap" style={{ marginBottom: 14 }}>
            <table>
              <thead>
                <tr>
                  <th>Vital</th>
                  <th className="num">Value</th>
                  <th>Flag</th>
                  <th>Recorded</th>
                </tr>
              </thead>
              <tbody>
                {readings.data.map((r) => (
                  <tr key={r.id}>
                    <td>{r.vitalType.name}</td>
                    <td className="num">
                      {r.value} {r.vitalType.unit}
                    </td>
                    <td>
                      {r.flag ? (
                        <span className={`badge badge-flag-${r.flag}`}>
                          {FLAG_LABEL[r.flag]}
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>{formatDateTime(r.recordedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <ErrorNote error={readings.error} fallback="Could not load recorded vitals" />

        {canRecord && activeTypes.length > 0 && (
          <>
            {issue && (
              <div className="alert" role="alert">
                {issue}
              </div>
            )}
            <div className="form-grid-3">
              {activeTypes.map((t) => {
                const raw = values[t.id] ?? '';
                const parsed = Number(raw);
                const flag =
                  raw.trim() && Number.isFinite(parsed)
                    ? flagFor(parsed, t.refLow, t.refHigh)
                    : null;
                return (
                  <div className="field" key={t.id}>
                    <label htmlFor={`vital-${t.id}`}>
                      {t.name} <span className="muted">({t.unit})</span>
                    </label>
                    <input
                      id={`vital-${t.id}`}
                      type="number"
                      step="any"
                      value={raw}
                      onChange={(e) =>
                        setValues((prev) => ({ ...prev, [t.id]: e.target.value }))
                      }
                    />
                    <span className="hint">
                      {t.refLow != null || t.refHigh != null ? (
                        <>
                          Ref {t.refLow ?? '—'}–{t.refHigh ?? '—'}
                          {flag && (
                            <>
                              {' · '}
                              <span className={`badge badge-flag-${flag}`}>
                                {FLAG_LABEL[flag]}
                              </span>
                            </>
                          )}
                        </>
                      ) : (
                        'No reference range'
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="row no-print" style={{ marginTop: 4 }}>
              <button
                type="button"
                disabled={record.isPending}
                onClick={() => record.mutate()}
              >
                {record.isPending ? 'Saving…' : 'Record vitals'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
