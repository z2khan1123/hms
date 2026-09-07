import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import {
  BILL_ITEM_STATUS_LABELS,
  FREQUENCY_SUGGESTIONS,
  OPD_STATUS_LABELS,
  SERVICE_ORDER_STATUS_LABELS,
  VISIT_STAGE_LABELS,
  adjustBillItemSchema,
  computeBillLine,
  createServiceOrdersSchema,
  flagFor,
  formatBps,
  formatMoney,
  percentToBps,
  recordVitalsSchema,
  setPrescriptionSchema,
  toMajor,
  toMinor,
  updateOpdVisitSchema,
  type BillItem,
  type CaseLedger,
  type OpdVisit,
  type OpdVisitStatus,
  type Patient,
  type PatientHistoryAlert,
  type PrescriptionItem,
  type Practitioner,
  type Service,
  type ServiceOrder,
  type UpdateOpdVisitInput,
  type UpdatePatientInput,
  type VitalReading,
  type VitalType,
} from '@hms/shared';
import { api } from '../lib/api';
import { useCan } from '../lib/permissions';
import { num } from '../lib/bill-line';
import { blankToUndefined, formatDate, formatDateTime, fullName } from '../lib/format';
import { DiagnosisEditor, type DiagnosisDraft } from '../components/DiagnosisEditor';
import { ErrorNote, Loading } from '../components/QueryFeedback';
import { PatientHeader } from '../components/PatientHeader';
import { ServicePicker } from '../components/ServicePicker';
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

  // --- history alert -------------------------------------------------------
  // Put a returning patient's allergy and history in front of the doctor once,
  // before he starts, rather than hoping he opens the right tab.
  const patientId = visit.data?.patient.id ?? '';

  const historyAlert = useQuery({
    queryKey: ['patient', 'history-alert', patientId],
    queryFn: async () => {
      const { data } = await api.get<PatientHistoryAlert>(
        `/patients/${patientId}/history-alert`,
      );
      return data;
    },
    enabled: Boolean(patientId),
  });

  const [historyAlertDismissed, setHistoryAlertDismissed] = useState(false);

  const saveAllergyToRecord = useMutation({
    mutationFn: async (value: string) => {
      const payload: UpdatePatientInput = { knownAllergies: value };
      const { data } = await api.patch<Patient>(`/patients/${patientId}`, payload);
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['patient', 'history-alert', patientId],
      });
      await queryClient.invalidateQueries({ queryKey: ['opd', 'visit', id] });
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
  const canPrescribe = can('prescription:write') && canEdit;
  const canOrder = can('order:create') && v.status !== 'cancelled' && v.status !== 'completed';
  const allergyText = v.knownAllergies?.trim() || v.patient.knownAllergies?.trim() || '';
  const canUpdatePatient = can('patient:update');
  const history = historyAlert.data;

  return (
    <>
      {history?.hasHistory && !historyAlertDismissed && (
        <HistoryAlertModal
          alert={history}
          onDismiss={() => setHistoryAlertDismissed(true)}
        />
      )}

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
            <dt>Stage</dt>
            <dd>
              <StatusBadge status={v.stage} label={VISIT_STAGE_LABELS[v.stage]} />
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
            {can('admission:create') && v.status !== 'cancelled' && (
              <Link
                to={`/admissions/new?patientId=${v.patient.id}&fromOpdVisitId=${v.id}`}
              >
                <button type="button" className="secondary">
                  Admit to ward
                </button>
              </Link>
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
                <span className="hint">
                  Saved to this visit when you save the consultation.
                </span>
                {canEdit && canUpdatePatient && (
                  <>
                    <div className="row no-print" style={{ marginTop: 6 }}>
                      <button
                        type="button"
                        className="secondary"
                        disabled={
                          !knownAllergies.trim() || saveAllergyToRecord.isPending
                        }
                        onClick={() =>
                          saveAllergyToRecord.mutate(knownAllergies.trim())
                        }
                      >
                        {saveAllergyToRecord.isPending
                          ? 'Saving…'
                          : "Also save to the patient's permanent record"}
                      </button>
                      {saveAllergyToRecord.isSuccess && (
                        <span className="muted">Saved to the record.</span>
                      )}
                    </div>
                    <span className="hint">
                      Writes the allergy to the patient's file — this is what makes the
                      warning pop up for the next doctor who sees them.
                    </span>
                    <ErrorNote
                      error={saveAllergyToRecord.error}
                      fallback="Could not update the patient record"
                    />
                  </>
                )}
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

      <ChargesPanel visitId={v.id} caseId={v.caseId} />

      <PrescriptionPanel visitId={v.id} canWrite={canPrescribe} />

      <OrdersPanel visitId={v.id} canOrder={canOrder} canRead={can('order:read')} />

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
// Charges for this visit — a doctor may concede his own fee here
// ---------------------------------------------------------------------------

function ChargesPanel({ visitId, caseId }: { visitId: string; caseId: string }) {
  const can = useCan();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);

  const ledger = useQuery({
    // Same shape and key family as the case billing page — one cache entry.
    queryKey: ['case', 'ledger', caseId],
    queryFn: async () => {
      const { data } = await api.get<CaseLedger>(`/billing/cases/${caseId}/ledger`);
      return data;
    },
    enabled: Boolean(caseId),
  });

  const currency = ledger.data?.currency || 'PKR';
  const lines = (ledger.data?.items ?? []).filter((it) => it.opdVisitId === visitId);
  const canDiscount = can('bill:discount');

  const afterSave = async () => {
    setEditingId(null);
    await queryClient.invalidateQueries({ queryKey: ['case', 'ledger', caseId] });
    await queryClient.invalidateQueries({ queryKey: ['opd', 'visit', visitId] });
  };

  return (
    <div className="card">
      <div className="section">
        <h2>Charges for this visit</h2>
        <ErrorNote error={ledger.error} fallback="Could not load the charges" />
        {ledger.isPending && <Loading label="Loading charges…" />}
        {ledger.data && lines.length === 0 && (
          <p className="muted">No charges recorded for this visit.</p>
        )}
        {lines.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="num">Qty</th>
                  <th className="num">Price</th>
                  <th className="num">Discount</th>
                  <th className="num">Net</th>
                  <th>Payment</th>
                  <th className="no-print" />
                </tr>
              </thead>
              <tbody>
                {lines.map((it) => (
                  <ChargeRow
                    key={it.id}
                    item={it}
                    currency={currency}
                    canDiscount={canDiscount}
                    editing={editingId === it.id}
                    onEdit={() => setEditingId(it.id)}
                    onCancel={() => setEditingId(null)}
                    onSaved={afterSave}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ChargeRow({
  item,
  currency,
  canDiscount,
  editing,
  onEdit,
  onCancel,
  onSaved,
}: {
  item: BillItem;
  currency: string;
  canDiscount: boolean;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSaved: () => Promise<void> | void;
}) {
  return (
    <>
      <tr>
        <td>
          {item.serviceName}
          {item.note ? <div className="muted">{item.note}</div> : null}
          {item.discountReason ? (
            <div className="muted">Concession: {item.discountReason}</div>
          ) : null}
        </td>
        <td className="num">{item.quantity}</td>
        <td className="num">{formatMoney(item.priceMinor, currency)}</td>
        <td className="num">
          {item.discountMinor > 0 ? `-${formatMoney(item.discountMinor, currency)}` : '—'}
          {item.discountBps > 0 ? (
            <div className="muted">{formatBps(item.discountBps)}</div>
          ) : null}
        </td>
        <td className="num">{formatMoney(item.netMinor, currency)}</td>
        <td>
          <StatusBadge
            status={item.status}
            label={BILL_ITEM_STATUS_LABELS[item.status]}
          />
        </td>
        <td className="no-print">
          {item.status === 'pending' && canDiscount && !editing && (
            <button type="button" className="secondary" onClick={onEdit}>
              Reduce fee
            </button>
          )}
        </td>
      </tr>

      {item.status === 'paid' && (
        <tr>
          <td colSpan={7} className="muted">
            Already paid — a change now needs a refund at the counter.
          </td>
        </tr>
      )}

      {editing && (
        <tr>
          <td colSpan={7}>
            <ReduceFeeForm
              item={item}
              currency={currency}
              onCancel={onCancel}
              onSaved={onSaved}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function ReduceFeeForm({
  item,
  currency,
  onCancel,
  onSaved,
}: {
  item: BillItem;
  currency: string;
  onCancel: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [mode, setMode] = useState<'price' | 'percent'>('price');
  const [priceMajor, setPriceMajor] = useState(String(toMajor(item.priceMinor)));
  const [percent, setPercent] = useState('');
  const [reason, setReason] = useState('');
  const [issue, setIssue] = useState<string | null>(null);

  const nextPriceMinor =
    mode === 'price' ? Math.max(0, toMinor(num(priceMajor))) : item.priceMinor;
  const nextDiscountBps =
    mode === 'percent'
      ? Math.min(10_000, Math.max(0, percentToBps(num(percent))))
      : 0;

  const preview = computeBillLine({
    priceMinor: nextPriceMinor,
    quantity: item.quantity,
    ...(mode === 'percent' ? { discountBps: nextDiscountBps } : {}),
  });

  const reasonOk = reason.trim().length >= 3;

  const save = useMutation({
    mutationFn: async () => {
      const payload = {
        ...(mode === 'price'
          ? { priceMinor: nextPriceMinor }
          : { discountBps: nextDiscountBps }),
        discountReason: reason.trim(),
      };
      const parsed = adjustBillItemSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? 'Check the fields.');
      }
      const { data } = await api.patch<BillItem>(
        `/billing/bill-items/${item.id}`,
        parsed.data,
      );
      return data;
    },
    onSuccess: async () => {
      setIssue(null);
      await onSaved();
    },
    onError: (err) =>
      setIssue(err instanceof Error ? err.message : 'Could not reduce the fee'),
  });

  return (
    <div className="section" style={{ marginTop: 0 }}>
      <h2>Reduce fee</h2>
      {issue && (
        <div className="alert" role="alert">
          {issue}
        </div>
      )}
      <ErrorNote error={save.error} fallback="Could not reduce the fee" />
      <div className="form-grid-3">
        <div className="field">
          <label htmlFor={`reduce-mode-${item.id}`}>How</label>
          <select
            id={`reduce-mode-${item.id}`}
            value={mode}
            onChange={(e) => setMode(e.target.value as 'price' | 'percent')}
          >
            <option value="price">Set a new price</option>
            <option value="percent">Apply a percentage discount</option>
          </select>
        </div>
        {mode === 'price' ? (
          <div className="field">
            <label htmlFor={`reduce-price-${item.id}`}>New price ({currency})</label>
            <input
              id={`reduce-price-${item.id}`}
              type="number"
              min="0"
              step="0.01"
              value={priceMajor}
              onChange={(e) => setPriceMajor(e.target.value)}
            />
          </div>
        ) : (
          <div className="field">
            <label htmlFor={`reduce-pct-${item.id}`}>Discount %</label>
            <input
              id={`reduce-pct-${item.id}`}
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
            />
          </div>
        )}
        <div className="field">
          <label htmlFor={`reduce-reason-${item.id}`}>Reason</label>
          <input
            id={`reduce-reason-${item.id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. staff family, hardship waiver"
          />
          <span className="hint">Required — at least 3 characters.</span>
        </div>
      </div>
      <div className="row" style={{ marginTop: 8 }}>
        <button
          type="button"
          disabled={!reasonOk || save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? 'Saving…' : 'Apply concession'}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Cancel
        </button>
        <span className="muted">
          Patient will pay {formatMoney(preview.netMinor, currency)}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Prescription
// ---------------------------------------------------------------------------

interface PrescriptionRow {
  drugName: string;
  dose: string;
  frequency: string;
  durationDays: string;
  instructions: string;
}

const EMPTY_RX_ROW: PrescriptionRow = {
  drugName: '',
  dose: '',
  frequency: '',
  durationDays: '',
  instructions: '',
};

function toRxRow(item: PrescriptionItem): PrescriptionRow {
  return {
    drugName: item.drugName,
    dose: item.dose ?? '',
    frequency: item.frequency ?? '',
    durationDays: item.durationDays != null ? String(item.durationDays) : '',
    instructions: item.instructions ?? '',
  };
}

const FREQ_LIST_ID = 'rx-frequency-suggestions';

function PrescriptionPanel({
  visitId,
  canWrite,
}: {
  visitId: string;
  canWrite: boolean;
}) {
  const queryClient = useQueryClient();
  const [rows, setRows] = useState<PrescriptionRow[]>([EMPTY_RX_ROW]);
  const [issue, setIssue] = useState<string | null>(null);

  const rx = useQuery({
    // PrescriptionItem[] for this visit — its own shape, its own key.
    queryKey: ['opd', 'prescription', visitId],
    queryFn: async () => {
      const { data } = await api.get<PrescriptionItem[]>(`/opd/${visitId}/prescription`);
      return data;
    },
    enabled: Boolean(visitId),
  });

  useEffect(() => {
    if (!rx.data) return;
    setRows(rx.data.length ? rx.data.map(toRxRow) : [EMPTY_RX_ROW]);
  }, [rx.data]);

  const save = useMutation({
    mutationFn: async () => {
      const items = rows
        .filter((r) => r.drugName.trim())
        .map((r) => ({
          drugName: r.drugName.trim(),
          dose: blankToUndefined(r.dose),
          frequency: blankToUndefined(r.frequency),
          durationDays: r.durationDays.trim() ? Number(r.durationDays) : undefined,
          instructions: blankToUndefined(r.instructions),
        }));
      const parsed = setPrescriptionSchema.safeParse({ items });
      if (!parsed.success) {
        throw new Error(
          parsed.error.issues[0]?.message ?? 'Check the prescription rows.',
        );
      }
      const { data } = await api.put<PrescriptionItem[]>(
        `/opd/${visitId}/prescription`,
        parsed.data,
      );
      return data;
    },
    onSuccess: async () => {
      setIssue(null);
      await queryClient.invalidateQueries({
        queryKey: ['opd', 'prescription', visitId],
      });
    },
    onError: (err) =>
      setIssue(err instanceof Error ? err.message : 'Could not save the prescription'),
  });

  const setRow = (index: number, patch: Partial<PrescriptionRow>) =>
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  return (
    <div className="card">
      <div className="section">
        <h2>Prescription</h2>
        <datalist id={FREQ_LIST_ID}>
          {FREQUENCY_SUGGESTIONS.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>

        <ErrorNote error={rx.error} fallback="Could not load the prescription" />
        {rx.isPending && <Loading label="Loading prescription…" />}
        {issue && (
          <div className="alert" role="alert">
            {issue}
          </div>
        )}
        <ErrorNote error={save.error} fallback="Could not save the prescription" />

        {!canWrite && rx.data && rx.data.length === 0 && (
          <p className="muted">No prescription recorded.</p>
        )}

        {(canWrite || (rx.data && rx.data.length > 0)) && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Drug</th>
                  <th>Dose</th>
                  <th>Frequency</th>
                  <th className="num">Days</th>
                  <th>Instructions</th>
                  {canWrite && <th className="no-print" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i}>
                    <td>
                      <input
                        aria-label={`Drug ${i + 1}`}
                        value={r.drugName}
                        disabled={!canWrite}
                        onChange={(e) => setRow(i, { drugName: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Dose ${i + 1}`}
                        value={r.dose}
                        disabled={!canWrite}
                        onChange={(e) => setRow(i, { dose: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Frequency ${i + 1}`}
                        list={FREQ_LIST_ID}
                        value={r.frequency}
                        disabled={!canWrite}
                        onChange={(e) => setRow(i, { frequency: e.target.value })}
                      />
                    </td>
                    <td className="num">
                      <input
                        type="number"
                        min="1"
                        max="365"
                        aria-label={`Duration in days ${i + 1}`}
                        value={r.durationDays}
                        disabled={!canWrite}
                        onChange={(e) => setRow(i, { durationDays: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Instructions ${i + 1}`}
                        value={r.instructions}
                        disabled={!canWrite}
                        onChange={(e) => setRow(i, { instructions: e.target.value })}
                      />
                    </td>
                    {canWrite && (
                      <td className="no-print">
                        <button
                          type="button"
                          className="secondary"
                          disabled={rows.length === 1}
                          onClick={() =>
                            setRows((prev) => prev.filter((_, idx) => idx !== i))
                          }
                        >
                          Remove
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {canWrite && (
          <div className="row no-print" style={{ marginTop: 12 }}>
            <button
              type="button"
              className="secondary"
              onClick={() => setRows((prev) => [...prev, EMPTY_RX_ROW])}
            >
              Add row
            </button>
            <button type="button" disabled={save.isPending} onClick={() => save.mutate()}>
              {save.isPending ? 'Saving…' : 'Save prescription'}
            </button>
            {save.isSuccess && <span className="muted">Saved.</span>}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Recommended tests & services
// ---------------------------------------------------------------------------

interface BasketItem {
  key: string;
  serviceId?: string;
  name: string;
  priceMinor: number | null;
  quantity: string;
  note: string;
}

function OrdersPanel({
  visitId,
  canOrder,
  canRead,
}: {
  visitId: string;
  canOrder: boolean;
  canRead: boolean;
}) {
  const queryClient = useQueryClient();
  const [basket, setBasket] = useState<BasketItem[]>([]);
  const [issue, setIssue] = useState<string | null>(null);

  const orders = useQuery({
    // ServiceOrder[] scoped to this visit — distinct from the worklist key.
    queryKey: ['orders', 'byVisit', visitId],
    queryFn: async () => {
      const { data } = await api.get<ServiceOrder[]>('/orders', {
        params: { opdVisitId: visitId },
      });
      return data;
    },
    enabled: Boolean(visitId) && canRead,
  });

  const submit = useMutation({
    mutationFn: async () => {
      const parsed = createServiceOrdersSchema.safeParse({
        opdVisitId: visitId,
        orders: basket.map((b) => ({
          serviceId: b.serviceId,
          serviceName: b.serviceId ? undefined : b.name,
          priceMinor: b.priceMinor ?? undefined,
          quantity: b.quantity.trim() ? Number(b.quantity) : undefined,
          note: blankToUndefined(b.note),
        })),
      });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? 'Check the basket.');
      }
      const { data } = await api.post<ServiceOrder[]>('/orders', parsed.data);
      return data;
    },
    onSuccess: async () => {
      setBasket([]);
      setIssue(null);
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      await queryClient.invalidateQueries({ queryKey: ['opd', 'list'] });
      await queryClient.invalidateQueries({ queryKey: ['opd', 'visit', visitId] });
    },
    onError: (err) =>
      setIssue(err instanceof Error ? err.message : 'Could not place the orders'),
  });

  const addService = (s: Service) =>
    setBasket((prev) => [
      ...prev,
      {
        key: `${s.id}-${Date.now()}`,
        serviceId: s.id,
        name: s.name,
        priceMinor: s.defaultPriceMinor,
        quantity: '1',
        note: '',
      },
    ]);

  const addFreeText = (name: string) =>
    setBasket((prev) => [
      ...prev,
      {
        key: `text-${Date.now()}`,
        name,
        priceMinor: null,
        quantity: '1',
        note: '',
      },
    ]);

  const setItem = (key: string, patch: Partial<BasketItem>) =>
    setBasket((prev) => prev.map((b) => (b.key === key ? { ...b, ...patch } : b)));

  function paymentStateLabel(o: ServiceOrder): string {
    if (o.approvedWithoutPayment) return 'Approved without payment';
    if (o.billStatus === 'paid') return 'Paid';
    if (o.billStatus === 'pending') return 'Payment pending';
    if (o.billStatus === 'cancelled') return 'Charge cancelled';
    if (o.billStatus === 'refunded') return 'Refunded';
    return 'No charge';
  }

  return (
    <div className="card">
      <div className="section">
        <h2>Recommended tests &amp; services</h2>

        {canOrder && (
          <>
            {issue && (
              <div className="alert" role="alert">
                {issue}
              </div>
            )}
            <ErrorNote error={submit.error} fallback="Could not place the orders" />
            <ServicePicker
              label="Add a test or service"
              onSelect={addService}
              onSubmitText={addFreeText}
            />

            {basket.length > 0 && (
              <div className="table-wrap" style={{ marginTop: 12 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Service</th>
                      <th className="num">Qty</th>
                      <th>Note</th>
                      <th className="no-print" />
                    </tr>
                  </thead>
                  <tbody>
                    {basket.map((b) => (
                      <tr key={b.key}>
                        <td>
                          {b.name}
                          <div className="muted">
                            {b.serviceId
                              ? b.priceMinor != null
                                ? formatMoney(b.priceMinor)
                                : 'Service'
                              : 'One-off item'}
                          </div>
                        </td>
                        <td className="num">
                          <input
                            type="number"
                            min="1"
                            max="99"
                            aria-label={`Quantity for ${b.name}`}
                            value={b.quantity}
                            onChange={(e) => setItem(b.key, { quantity: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            aria-label={`Note for ${b.name}`}
                            value={b.note}
                            onChange={(e) => setItem(b.key, { note: e.target.value })}
                          />
                        </td>
                        <td className="no-print">
                          <button
                            type="button"
                            className="secondary"
                            onClick={() =>
                              setBasket((prev) => prev.filter((x) => x.key !== b.key))
                            }
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="row no-print" style={{ marginTop: 12 }}>
              <button
                type="button"
                disabled={basket.length === 0 || submit.isPending}
                onClick={() => submit.mutate()}
              >
                {submit.isPending ? 'Submitting…' : 'Order selected'}
              </button>
              <span className="muted">
                Each order becomes a pending charge the cashier collects.
              </span>
            </div>
          </>
        )}

        <h2 style={{ marginTop: canOrder ? 20 : 0 }}>Orders on this visit</h2>
        <ErrorNote error={orders.error} fallback="Could not load orders" />
        {orders.isPending && canRead && <Loading label="Loading orders…" />}
        {orders.data && orders.data.length === 0 && (
          <p className="muted">No tests or services ordered yet.</p>
        )}
        {orders.data && orders.data.length > 0 && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Service</th>
                  <th>Ordered</th>
                  <th>Status</th>
                  <th>Payment</th>
                </tr>
              </thead>
              <tbody>
                {orders.data.map((o) => (
                  <tr key={o.id}>
                    <td>
                      {o.serviceName}
                      {o.note ? <div className="muted">{o.note}</div> : null}
                    </td>
                    <td>{formatDateTime(o.orderedAt)}</td>
                    <td>
                      <StatusBadge
                        status={o.status}
                        label={SERVICE_ORDER_STATUS_LABELS[o.status]}
                      />
                    </td>
                    <td>
                      {o.billStatus === 'pending' && !o.approvedWithoutPayment ? (
                        <span className="badge badge-ordered">Payment pending</span>
                      ) : (
                        <span className="muted">{paymentStateLabel(o)}</span>
                      )}
                    </td>
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

// ---------------------------------------------------------------------------
// Returning-patient history alert
// ---------------------------------------------------------------------------

function HistoryAlertModal({
  alert,
  onDismiss,
}: {
  alert: PatientHistoryAlert;
  onDismiss: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialogRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss();
    };
    document.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onDismiss]);

  const allergy = alert.knownAllergies?.trim();
  const hasVisits = alert.previousVisitCount > 0;
  const hasDiagnoses = alert.recentDiagnoses.length > 0;
  const hasAdmissions = alert.previousAdmissionCount > 0;

  return (
    <div
      className="modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onDismiss();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="history-alert-title"
        tabIndex={-1}
        ref={dialogRef}
      >
        <h2 id="history-alert-title">This patient has been seen here before</h2>

        {allergy && (
          <div className="modal-allergy" role="alert">
            <span className="modal-allergy-tag">Allergy</span>
            <span>{allergy}</span>
            {alert.allergiesUpdatedAt && (
              <span className="modal-allergy-age">
                on record since {formatDate(alert.allergiesUpdatedAt)}
              </span>
            )}
          </div>
        )}

        {(hasVisits || hasDiagnoses || hasAdmissions) && (
          <div className="modal-body">
            {hasVisits && (
              <p>
                <strong>{alert.previousVisitCount}</strong> previous visit
                {alert.previousVisitCount === 1 ? '' : 's'}
                {alert.lastVisitAt && <> · last on {formatDateTime(alert.lastVisitAt)}</>}
                {alert.lastVisitPractitioner && <> with {alert.lastVisitPractitioner}</>}
              </p>
            )}

            {hasDiagnoses && (
              <div>
                <p className="modal-subhead">Recent diagnoses</p>
                <ul>
                  {alert.recentDiagnoses.map((d) => (
                    <li key={`${d.code}-${d.recordedAt}`}>
                      <strong>{d.code}</strong> {d.title} · {formatDate(d.recordedAt)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {hasAdmissions && (
              <p>
                <strong>{alert.previousAdmissionCount}</strong> previous admission
                {alert.previousAdmissionCount === 1 ? '' : 's'}
              </p>
            )}
          </div>
        )}

        <div className="row" style={{ marginTop: 16 }}>
          <button type="button" onClick={onDismiss}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
