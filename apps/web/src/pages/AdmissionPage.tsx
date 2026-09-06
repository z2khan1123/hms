import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import {
  ADMISSION_STATUS_LABELS,
  computeBillLine,
  flagFor,
  formatMoney,
  createNurseNoteSchema,
  dischargeSchema,
  recordVitalsSchema,
  revertDischargeSchema,
  transferBedSchema,
  percentToBps,
  toMajor,
  toMinor,
  type Admission,
  type Bed,
  type NurseNote,
  type VitalReading,
  type VitalType,
} from '@hms/shared';
import { api } from '../lib/api';
import { useCan } from '../lib/permissions';
import { num } from '../lib/bill-line';
import {
  blankToUndefined,
  formatDateTime,
  fullName,
  localInputToIso,
  toLocalInput,
} from '../lib/format';
import { ErrorNote, Loading } from '../components/QueryFeedback';
import { PatientHeader } from '../components/PatientHeader';
import { StatusBadge } from '../components/StatusBadge';
import { Tabs } from '../components/Tabs';

type TabKey = 'notes' | 'vitals' | 'beds' | 'discharge';

const TABS = [
  { value: 'notes', label: 'Nurse notes' },
  { value: 'vitals', label: 'Vitals' },
  { value: 'beds', label: 'Bed history' },
  { value: 'discharge', label: 'Discharge' },
] as const satisfies readonly { value: TabKey; label: string }[];

const FLAG_LABEL: Record<'low' | 'normal' | 'high', string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
};

function useAvailableBeds() {
  return useQuery({
    // Bed[] filtered to available — shared with the admit screen's key.
    queryKey: ['wards', 'beds', 'all', 'available', false],
    queryFn: async () => {
      const { data } = await api.get<Bed[]>('/wards/beds', {
        params: { status: 'available' },
      });
      return data;
    },
  });
}

function BedOptions({ beds }: { beds: Bed[] }) {
  const groups = useMemo(() => {
    const map = new Map<string, { label: string; beds: Bed[] }>();
    for (const bed of beds) {
      const key = bed.ward.id;
      const group = map.get(key) ?? {
        label: `${bed.ward.name} · ${bed.ward.floor.name}`,
        beds: [],
      };
      group.beds.push(bed);
      map.set(key, group);
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [beds]);

  return (
    <>
      {groups.map((g) => (
        <optgroup key={g.label} label={g.label}>
          {g.beds.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name} ({b.bedType.name})
            </option>
          ))}
        </optgroup>
      ))}
    </>
  );
}

export function AdmissionPage() {
  const { id = '' } = useParams();
  const can = useCan();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>('notes');

  const admission = useQuery({
    // Admission detail — distinct from the ['admissions','list',…] shape.
    queryKey: ['admissions', 'detail', id],
    queryFn: async () => {
      const { data } = await api.get<Admission>(`/admissions/${id}`);
      return data;
    },
    enabled: Boolean(id),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admissions', 'detail', id] });
    await queryClient.invalidateQueries({ queryKey: ['admissions', 'list'] });
    await queryClient.invalidateQueries({ queryKey: ['wards'] });
  };

  // --- transfer (header action) -----------------------------------------------
  const [transferring, setTransferring] = useState(false);
  const [transferBedId, setTransferBedId] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [transferIssue, setTransferIssue] = useState<string | null>(null);
  const availableBeds = useAvailableBeds();

  const transfer = useMutation({
    mutationFn: async () => {
      const parsed = transferBedSchema.safeParse({
        bedId: transferBedId,
        reason: blankToUndefined(transferReason),
      });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? 'Pick a bed to move to');
      }
      await api.post(`/admissions/${id}/transfer`, parsed.data);
    },
    onSuccess: async () => {
      setTransferring(false);
      setTransferBedId('');
      setTransferReason('');
      setTransferIssue(null);
      await invalidate();
    },
    onError: (err) =>
      setTransferIssue(err instanceof Error ? err.message : 'Could not transfer the patient'),
  });

  if (admission.isPending) return <Loading label="Loading admission…" />;
  if (admission.isError)
    return <ErrorNote error={admission.error} fallback="Could not load this admission" />;
  if (!admission.data) return null;

  const a = admission.data;
  const allergyText = a.patient.knownAllergies?.trim() || '';
  const isAdmitted = a.status === 'admitted';

  return (
    <>
      <div className="page-head">
        <h1>Admission {a.admissionNo}</h1>
        <Link to="/admissions">Back to admissions</Link>
      </div>

      {allergyText && (
        <div className="allergy-alert" role="alert">
          <span className="allergy-alert-tag">Allergy alert</span>
          <span>{allergyText}</span>
        </div>
      )}

      <PatientHeader
        patient={a.patient}
        showAllergyBanner={false}
        actions={
          can('admission:transfer') && isAdmitted ? (
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setTransferring((v) => !v);
                setTransferIssue(null);
              }}
            >
              {transferring ? 'Close transfer' : 'Transfer'}
            </button>
          ) : undefined
        }
      />

      {transferring && (
        <div className="card">
          <div className="section">
            <h2>Transfer to another bed</h2>
            {transferIssue && (
              <div className="alert" role="alert">
                {transferIssue}
              </div>
            )}
            <ErrorNote error={availableBeds.error} fallback="Could not load beds" />
            <div className="form-grid">
              <div className="field">
                <label htmlFor="transferBed">New bed</label>
                <select
                  id="transferBed"
                  value={transferBedId}
                  onChange={(e) => setTransferBedId(e.target.value)}
                >
                  <option value="">Select an available bed…</option>
                  <BedOptions beds={availableBeds.data ?? []} />
                </select>
              </div>
              <div className="field">
                <label htmlFor="transferReason">Reason (optional)</label>
                <input
                  id="transferReason"
                  value={transferReason}
                  onChange={(e) => setTransferReason(e.target.value)}
                />
              </div>
            </div>
            <div className="row">
              <button
                type="button"
                disabled={transfer.isPending || !transferBedId}
                onClick={() => transfer.mutate()}
              >
                {transfer.isPending ? 'Transferring…' : 'Confirm transfer'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="section">
          <h2>Admission</h2>
          <dl className="kv">
            <dt>Admission no</dt>
            <dd>{a.admissionNo}</dd>
            <dt>Case no</dt>
            <dd>
              <Link to={`/cases/${a.caseId}/billing`}>{a.caseNo}</Link>
            </dd>
            <dt>Status</dt>
            <dd>
              <StatusBadge status={a.status} label={ADMISSION_STATUS_LABELS[a.status]} />
            </dd>
            <dt>Consultant</dt>
            <dd>{fullName(a.practitioner)}</dd>
            <dt>Current bed</dt>
            <dd>
              {a.currentBed
                ? `${a.currentBed.bedName} · ${a.currentBed.wardName} · ${a.currentBed.floorName}`
                : '—'}
            </dd>
            <dt>Admitted at</dt>
            <dd>{formatDateTime(a.admittedAt)}</dd>
            <dt>Nights</dt>
            <dd>{a.nights}</dd>
            {a.dischargedAt && (
              <>
                <dt>Discharged at</dt>
                <dd>{formatDateTime(a.dischargedAt)}</dd>
              </>
            )}
            <dt>Case balance</dt>
            <dd
              className={
                a.caseBalance.balanceMinor > 0 ? 'balance-due' : 'balance-clear'
              }
            >
              {formatMoney(a.caseBalance.balanceMinor)}
            </dd>
          </dl>
          {a.provisionalDiagnosis && (
            <p style={{ marginTop: 12 }}>
              <span className="muted">Provisional diagnosis: </span>
              {a.provisionalDiagnosis}
            </p>
          )}
          {a.admissionNote && (
            <p>
              <span className="muted">Admission note: </span>
              {a.admissionNote}
            </p>
          )}
        </div>
      </div>

      <Tabs tabs={TABS} value={tab} onChange={setTab} ariaLabel="Admission record" />

      {tab === 'notes' && <NurseNotesTab admissionId={id} can={can} />}
      {tab === 'vitals' && (
        <VitalsTab
          admissionId={id}
          patientId={a.patient.id}
          caseId={a.caseId}
          canRecord={can('vital:create') && isAdmitted}
        />
      )}
      {tab === 'beds' && <BedHistoryTab admission={a} />}
      {tab === 'discharge' && (
        <DischargeTab admission={a} can={can} onDone={invalidate} />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Nurse notes
// ---------------------------------------------------------------------------

function NurseNotesTab({
  admissionId,
  can,
}: {
  admissionId: string;
  can: (p: 'nursenote:read' | 'nursenote:write') => boolean;
}) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState('');
  const [issue, setIssue] = useState<string | null>(null);
  const canRead = can('nursenote:read');
  const canWrite = can('nursenote:write');

  const notes = useQuery({
    // NurseNote[] for this admission — its own key.
    queryKey: ['admissions', 'nurse-notes', admissionId],
    queryFn: async () => {
      const { data } = await api.get<NurseNote[]>(
        `/admissions/${admissionId}/nurse-notes`,
      );
      return data;
    },
    enabled: Boolean(admissionId) && canRead,
  });

  const ordered = useMemo(
    () =>
      [...(notes.data ?? [])].sort(
        (x, y) => new Date(y.recordedAt).getTime() - new Date(x.recordedAt).getTime(),
    ),
    [notes.data],
  );

  const add = useMutation({
    mutationFn: async () => {
      const parsed = createNurseNoteSchema.safeParse({ note: note.trim() });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? 'Type a note first');
      }
      await api.post(`/admissions/${admissionId}/nurse-notes`, parsed.data);
    },
    onSuccess: async () => {
      setNote('');
      setIssue(null);
      await queryClient.invalidateQueries({
        queryKey: ['admissions', 'nurse-notes', admissionId],
      });
    },
    onError: (err) =>
      setIssue(err instanceof Error ? err.message : 'Could not add the note'),
  });

  return (
    <div className="card">
      <div className="section">
        <h2>Nurse notes</h2>

        {canWrite && (
          <>
            {issue && (
              <div className="alert" role="alert">
                {issue}
              </div>
            )}
            <ErrorNote error={add.error} fallback="Could not add the note" />
            <div className="field">
              <label htmlFor="nurseNote">Add a note</label>
              <textarea
                id="nurseNote"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <div className="row" style={{ marginBottom: 14 }}>
              <button
                type="button"
                disabled={add.isPending || !note.trim()}
                onClick={() => add.mutate()}
              >
                {add.isPending ? 'Saving…' : 'Add note'}
              </button>
            </div>
          </>
        )}

        {!canRead && <p className="muted">You cannot view nurse notes.</p>}
        <ErrorNote error={notes.error} fallback="Could not load nurse notes" />
        {notes.isPending && canRead && <Loading label="Loading notes…" />}
        {canRead && ordered.length === 0 && notes.isSuccess && (
          <p className="muted">No nurse notes recorded.</p>
        )}

        {ordered.length > 0 && (
          <ul className="term-list">
            {ordered.map((n) => (
              <li key={n.id} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                <div>{n.note}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {formatDateTime(n.recordedAt)}
                  {n.recordedBy ? ` · ${n.recordedBy}` : ''}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vitals
// ---------------------------------------------------------------------------

function VitalsTab({
  admissionId,
  patientId,
  caseId,
  canRecord,
}: {
  admissionId: string;
  patientId: string;
  caseId: string;
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
    // VitalReading[] scoped to this admission — distinct from the opd-visit key.
    queryKey: ['vitals', 'readings', 'admission', admissionId],
    queryFn: async () => {
      const { data } = await api.get<VitalReading[]>('/vitals', {
        params: { admissionId },
      });
      return data;
    },
    enabled: Boolean(admissionId),
  });

  const activeTypes = useMemo(
    () => (types.data ?? []).filter((t) => t.isActive),
    [types.data],
  );

  const record = useMutation({
    mutationFn: async () => {
      const list = (types.data ?? [])
        .map((t) => ({ vitalTypeId: t.id, value: Number(values[t.id]) }))
        .filter((r) => values[r.vitalTypeId]?.trim() && Number.isFinite(r.value));
      const parsed = recordVitalsSchema.safeParse({
        patientId,
        caseId,
        admissionId,
        readings: list,
      });
      if (!parsed.success) {
        throw new Error(
          parsed.error.issues[0]?.message ?? 'Enter at least one valid reading.',
        );
      }
      await api.post('/vitals', parsed.data);
    },
    onSuccess: async () => {
      setValues({});
      setIssue(null);
      await queryClient.invalidateQueries({
        queryKey: ['vitals', 'readings', 'admission', admissionId],
      });
    },
    onError: (err) =>
      setIssue(err instanceof Error ? err.message : 'Could not record vitals'),
  });

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
            <div className="row" style={{ marginTop: 4 }}>
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

// ---------------------------------------------------------------------------
// Bed history
// ---------------------------------------------------------------------------

function BedHistoryTab({ admission }: { admission: Admission }) {
  const rows = admission.bedHistory;
  return (
    <div className="card">
      <div className="section">
        <h2>Bed history</h2>
        {rows.length === 0 ? (
          <p className="muted">No bed movements recorded.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Bed</th>
                  <th>Ward</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.bedName}
                      <div className="muted">{r.bedType.name}</div>
                    </td>
                    <td>
                      {r.wardName}
                      <div className="muted">{r.floorName}</div>
                    </td>
                    <td>{formatDateTime(r.fromAt)}</td>
                    <td>{r.toAt ? formatDateTime(r.toAt) : 'Current'}</td>
                    <td>{r.moveReason ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Discharge
// ---------------------------------------------------------------------------

function DischargeTab({
  admission,
  can,
  onDone,
}: {
  admission: Admission;
  can: (p: 'admission:discharge') => boolean;
  onDone: () => Promise<void> | void;
}) {
  const a = admission;
  const suggestedRateMinor = a.currentBed?.bedType.defaultNightlyRateMinor ?? null;

  const [summary, setSummary] = useState(a.dischargeSummary ?? '');
  const [advice, setAdvice] = useState(a.dischargeAdvice ?? '');
  const [dischargedAtLocal, setDischargedAtLocal] = useState(() =>
    toLocalInput(new Date()),
  );
  const [postBedCharge, setPostBedCharge] = useState(
    suggestedRateMinor != null && a.nights > 0,
  );
  const [nightsStr, setNightsStr] = useState(String(a.nights));
  const [rateMajorStr, setRateMajorStr] = useState(
    suggestedRateMinor != null ? String(toMajor(suggestedRateMinor)) : '',
  );
  const [discountPctStr, setDiscountPctStr] = useState('');
  const [issue, setIssue] = useState<string | null>(null);

  const [reverting, setReverting] = useState(false);
  const [revertReason, setRevertReason] = useState('');
  const [revertIssue, setRevertIssue] = useState<string | null>(null);

  const nights = Math.max(0, Math.trunc(num(nightsStr)));
  const priceMinor = Math.max(0, toMinor(num(rateMajorStr)));
  const discountBps = Math.min(10_000, Math.max(0, percentToBps(num(discountPctStr))));
  const totals =
    nights > 0
      ? computeBillLine({ priceMinor, quantity: nights, discountBps })
      : { grossMinor: 0, discountMinor: 0, netMinor: 0 };

  const discharge = useMutation({
    mutationFn: async () => {
      const payload = {
        dischargedAt: dischargedAtLocal
          ? localInputToIso(dischargedAtLocal)
          : undefined,
        dischargeSummary: blankToUndefined(summary),
        dischargeAdvice: blankToUndefined(advice),
        bedCharge: postBedCharge
          ? {
              nights,
              priceMinor,
              serviceName: 'Bed charge',
              discountBps: discountBps > 0 ? discountBps : undefined,
            }
          : undefined,
      };
      const parsed = dischargeSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error(
          parsed.error.issues[0]?.message ?? 'Check the discharge details.',
        );
      }
      await api.post(`/admissions/${a.id}/discharge`, parsed.data);
    },
    onSuccess: async () => {
      setIssue(null);
      await onDone();
    },
    onError: (err) =>
      setIssue(err instanceof Error ? err.message : 'Could not discharge the patient'),
  });

  const revert = useMutation({
    mutationFn: async () => {
      const parsed = revertDischargeSchema.safeParse({ reason: revertReason.trim() });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? 'A reason is required');
      }
      await api.post(`/admissions/${a.id}/revert-discharge`, parsed.data);
    },
    onSuccess: async () => {
      setReverting(false);
      setRevertReason('');
      setRevertIssue(null);
      await onDone();
    },
    onError: (err) =>
      setRevertIssue(err instanceof Error ? err.message : 'Could not revert the discharge'),
  });

  if (a.status === 'discharged') {
    return (
      <div className="card">
        <div className="section">
          <h2>Discharge</h2>
          <dl className="kv">
            <dt>Discharged at</dt>
            <dd>{a.dischargedAt ? formatDateTime(a.dischargedAt) : '—'}</dd>
            <dt>Summary</dt>
            <dd style={{ whiteSpace: 'pre-wrap' }}>{a.dischargeSummary || '—'}</dd>
            <dt>Advice</dt>
            <dd style={{ whiteSpace: 'pre-wrap' }}>{a.dischargeAdvice || '—'}</dd>
            {a.revertedAt && (
              <>
                <dt>Reverted</dt>
                <dd>
                  {formatDateTime(a.revertedAt)}
                  {a.revertReason ? ` — ${a.revertReason}` : ''}
                </dd>
              </>
            )}
          </dl>

          {can('admission:discharge') && (
            <div style={{ marginTop: 14 }}>
              {revertIssue && (
                <div className="alert" role="alert">
                  {revertIssue}
                </div>
              )}
              <ErrorNote error={revert.error} fallback="Could not revert the discharge" />
              {reverting ? (
                <div className="row">
                  <input
                    placeholder="Reason for reverting the discharge"
                    value={revertReason}
                    onChange={(e) => setRevertReason(e.target.value)}
                    aria-label="Revert reason"
                    style={{ maxWidth: 360 }}
                  />
                  <button
                    type="button"
                    className="danger"
                    disabled={revert.isPending}
                    onClick={() => revert.mutate()}
                  >
                    Confirm revert
                  </button>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setReverting(false);
                      setRevertIssue(null);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setReverting(true);
                    setRevertReason('');
                    setRevertIssue(null);
                  }}
                >
                  Revert discharge
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (a.status === 'cancelled') {
    return (
      <div className="card">
        <div className="section">
          <h2>Discharge</h2>
          <p className="muted">This admission was cancelled.</p>
        </div>
      </div>
    );
  }

  function onDischarge(event: FormEvent) {
    event.preventDefault();
    discharge.mutate();
  }

  return (
    <form className="card" onSubmit={onDischarge} noValidate>
      <div className="section">
        <h2>Discharge</h2>
        {issue && (
          <div className="alert" role="alert">
            {issue}
          </div>
        )}
        <ErrorNote error={discharge.error} fallback="Could not discharge the patient" />

        <div className="field">
          <label htmlFor="dischargedAt">Discharged at</label>
          <input
            id="dischargedAt"
            type="datetime-local"
            value={dischargedAtLocal}
            onChange={(e) => setDischargedAtLocal(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="dischargeSummary">Discharge summary</label>
          <textarea
            id="dischargeSummary"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="dischargeAdvice">Advice</label>
          <textarea
            id="dischargeAdvice"
            value={advice}
            onChange={(e) => setAdvice(e.target.value)}
          />
        </div>
      </div>

      <div className="section">
        <h2>Bed charge</h2>
        <div className="check-row">
          <label>
            <input
              type="checkbox"
              checked={postBedCharge}
              onChange={(e) => setPostBedCharge(e.target.checked)}
            />
            Post a bed charge on discharge
          </label>
        </div>
        <p className="hint">
          Pre-filled from {a.nights} night{a.nights === 1 ? '' : 's'} ×{' '}
          {suggestedRateMinor != null
            ? `${formatMoney(suggestedRateMinor)} (the bed type's suggested nightly rate)`
            : 'a nightly rate'}
          . Every field is editable — what is confirmed here is what goes on the bill.
        </p>

        {postBedCharge && (
          <>
            <div className="form-grid-3">
              <div className="field">
                <label htmlFor="bedNights">Nights</label>
                <input
                  id="bedNights"
                  type="number"
                  min="0"
                  step="1"
                  value={nightsStr}
                  onChange={(e) => setNightsStr(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="bedRate">Nightly rate (PKR)</label>
                <input
                  id="bedRate"
                  type="number"
                  min="0"
                  step="0.01"
                  value={rateMajorStr}
                  onChange={(e) => setRateMajorStr(e.target.value)}
                />
                <span className="hint">A suggestion only — set what this patient pays.</span>
              </div>
              <div className="field">
                <label htmlFor="bedDiscount">Discount %</label>
                <input
                  id="bedDiscount"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={discountPctStr}
                  onChange={(e) => setDiscountPctStr(e.target.value)}
                />
              </div>
            </div>
            <div className="line-total">
              <span>
                Gross <strong>{formatMoney(totals.grossMinor)}</strong>
              </span>
              <span>
                Discount <strong>-{formatMoney(totals.discountMinor)}</strong>
              </span>
              <span>
                Net <strong>{formatMoney(totals.netMinor)}</strong>
              </span>
            </div>
          </>
        )}
      </div>

      <div className="section">
        <div className="row">
          <button type="submit" disabled={discharge.isPending}>
            {discharge.isPending ? 'Discharging…' : 'Discharge patient'}
          </button>
        </div>
      </div>
    </form>
  );
}
