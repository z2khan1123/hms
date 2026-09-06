import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  PAYMENT_MODE_LABELS,
  createOpdVisitSchema,
  formatMoney,
  toMajor,
  toMinor,
  type Case,
  type Charge,
  type CreateOpdVisitInput,
  type OpdVisit,
  type Patient,
  type PaymentMode,
  type Practitioner,
} from '@hms/shared';
import { api } from '../lib/api';
import {
  chargeLinePayload,
  chargeLineTotals,
  draftForCharge,
  emptyChargeLineDraft,
  num,
  type ChargeLineDraft,
} from '../lib/charge-line';
import { blankToUndefined, formatDateTime, fullName, localInputToIso, toLocalInput } from '../lib/format';
import { ChargeLineFields } from '../components/ChargeLineFields';
import { ChargePicker } from '../components/ChargePicker';
import { ErrorNote, Loading } from '../components/QueryFeedback';
import { PatientHeader } from '../components/PatientHeader';
import { PatientPicker } from '../components/PatientPicker';
import { VisitTermEditor, type TermDraft } from '../components/VisitTermEditor';

const PAYMENT_MODES: PaymentMode[] = [
  'cash',
  'card',
  'bank_transfer',
  'cheque',
  'online',
  'other',
];

const NEW_CASE = '__new__';

export function OpdNewPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params] = useSearchParams();
  const preselectedPatientId = params.get('patientId') ?? '';

  // --- patient -------------------------------------------------------------
  const [patient, setPatient] = useState<Patient | null>(null);

  const preselected = useQuery({
    queryKey: ['patient', 'detail', preselectedPatientId],
    queryFn: async () => {
      const { data } = await api.get<Patient>(`/patients/${preselectedPatientId}`);
      return data;
    },
    enabled: Boolean(preselectedPatientId),
  });

  useEffect(() => {
    if (preselected.data) setPatient(preselected.data);
  }, [preselected.data]);

  // --- case ----------------------------------------------------------------
  const [caseChoice, setCaseChoice] = useState<string>(NEW_CASE);

  const cases = useQuery({
    queryKey: ['cases', 'byPatient', patient?.id ?? '', 'open'],
    queryFn: async () => {
      const { data } = await api.get<Case[]>('/cases', {
        params: { patientId: patient?.id, status: 'open' },
      });
      return data;
    },
    enabled: Boolean(patient?.id),
  });

  useEffect(() => {
    // Attaching to the patient's existing open case is the common path; opening a
    // second case for the same episode is what creates duplicate bills.
    setCaseChoice(cases.data && cases.data.length > 0 ? cases.data[0].id : NEW_CASE);
  }, [cases.data]);

  // --- visit ---------------------------------------------------------------
  const [practitionerId, setPractitionerId] = useState('');
  const [visitAtLocal, setVisitAtLocal] = useState(() => toLocalInput(new Date()));
  const [isFollowUp, setIsFollowUp] = useState(false);
  const [isAntenatal, setIsAntenatal] = useState(false);
  const [isCasualty, setIsCasualty] = useState(false);
  const [isLiveConsult, setIsLiveConsult] = useState(false);
  const [reference, setReference] = useState('');
  const [symptoms, setSymptoms] = useState<TermDraft[]>([]);
  const [note, setNote] = useState('');
  const [previousMedicalIssue, setPreviousMedicalIssue] = useState('');
  const [knownAllergies, setKnownAllergies] = useState('');

  useEffect(() => {
    setKnownAllergies(patient?.knownAllergies ?? '');
  }, [patient]);

  const practitioners = useQuery({
    queryKey: ['practitioners'],
    queryFn: async () => {
      const { data } = await api.get<Practitioner[]>('/practitioners');
      return data;
    },
  });

  // --- charge --------------------------------------------------------------
  const [billCharge, setBillCharge] = useState(true);
  const [charge, setCharge] = useState<Charge | null>(null);
  const [chargeDraft, setChargeDraft] = useState<ChargeLineDraft>(emptyChargeLineDraft);

  const chargeTotals = useMemo(() => chargeLineTotals(chargeDraft), [chargeDraft]);
  const netMinor = billCharge && charge ? chargeTotals.netMinor : 0;

  // --- payment -------------------------------------------------------------
  const [takePayment, setTakePayment] = useState(false);
  const [paymentMode, setPaymentMode] = useState<PaymentMode>('cash');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentTouched, setPaymentTouched] = useState(false);
  const [paymentNote, setPaymentNote] = useState('');
  const [chequeNo, setChequeNo] = useState('');
  const [chequeDate, setChequeDate] = useState('');

  useEffect(() => {
    // Keep the tendered amount in step with the bill until the cashier overrides it.
    if (!paymentTouched) setPaymentAmount(netMinor > 0 ? String(toMajor(netMinor)) : '');
  }, [netMinor, paymentTouched]);

  // --- submit --------------------------------------------------------------
  const [issues, setIssues] = useState<string[]>([]);

  const mutation = useMutation({
    mutationFn: async (payload: CreateOpdVisitInput) => {
      const { data } = await api.post<OpdVisit>('/opd', payload);
      return data;
    },
    onSuccess: async (visit) => {
      await queryClient.invalidateQueries({ queryKey: ['opd', 'list'] });
      await queryClient.invalidateQueries({ queryKey: ['cases'] });
      navigate(`/opd/${visit.id}`);
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setIssues([]);

    if (!patient) {
      setIssues(['Select a patient first.']);
      return;
    }
    if (takePayment && paymentMode === 'cheque' && (!chequeNo.trim() || !chequeDate)) {
      setIssues(['Cheque number and cheque date are required for cheque payments.']);
      return;
    }

    const payload = {
      patientId: patient.id,
      caseId: caseChoice === NEW_CASE ? undefined : caseChoice,
      practitionerId,
      visitAt: localInputToIso(visitAtLocal),
      isFollowUp,
      isAntenatal,
      isCasualty,
      isLiveConsult,
      reference: blankToUndefined(reference),
      note: blankToUndefined(note),
      previousMedicalIssue: blankToUndefined(previousMedicalIssue),
      knownAllergies: blankToUndefined(knownAllergies),
      symptoms: symptoms.length
        ? symptoms.map((s) => ({
            symptomId: s.refId,
            title: s.title,
            detail: blankToUndefined(s.detail),
          }))
        : undefined,
      charge: billCharge && charge ? chargeLinePayload(chargeDraft, charge.id) : undefined,
      payment: takePayment
        ? {
            amountMinor: toMinor(num(paymentAmount)),
            mode: paymentMode,
            note: blankToUndefined(paymentNote),
            chequeNo: paymentMode === 'cheque' ? chequeNo.trim() : undefined,
            chequeDate: paymentMode === 'cheque' ? chequeDate : undefined,
          }
        : undefined,
    };

    const parsed = createOpdVisitSchema.safeParse(payload);
    if (!parsed.success) {
      setIssues(
        parsed.error.issues.map((i) =>
          i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message,
        ),
      );
      return;
    }
    mutation.mutate(parsed.data);
  }

  const registerNewPatientHref = `/patients/new?returnTo=${encodeURIComponent('/opd/new')}`;

  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="page-head">
        <h1>Register OPD visit</h1>
        <Link to="/opd">Back to OPD list</Link>
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
      <ErrorNote error={mutation.error} fallback="Could not register the visit" />
      <ErrorNote error={preselected.error} fallback="Could not load that patient" />

      {/* 1 — patient ------------------------------------------------------- */}
      <div className="card">
        <div className="section">
          <h2>1 · Patient</h2>
          {preselected.isPending && preselectedPatientId && <Loading />}
          {patient ? (
            <>
              <PatientHeader patient={patient} />
              <div className="row" style={{ marginTop: 10 }}>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setPatient(null);
                    setCaseChoice(NEW_CASE);
                  }}
                >
                  Change patient
                </button>
              </div>
            </>
          ) : (
            <>
              <PatientPicker onSelect={setPatient} autoFocus />
              <p className="hint">
                New to the hospital? <Link to={registerNewPatientHref}>Register a patient</Link>{' '}
                — you will come back here with them selected.
              </p>
            </>
          )}
        </div>
      </div>

      {/* 2 — case ---------------------------------------------------------- */}
      <div className="card">
        <div className="section">
          <h2>2 · Case</h2>
          {!patient && <p className="muted">Select a patient first.</p>}
          {patient && (
            <>
              <ErrorNote error={cases.error} fallback="Could not load cases" />
              {cases.isPending && <Loading />}
              <div className="option-list">
                {cases.data?.map((c) => (
                  <label
                    key={c.id}
                    className={`option ${caseChoice === c.id ? 'option-selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="case"
                      checked={caseChoice === c.id}
                      onChange={() => setCaseChoice(c.id)}
                    />
                    <span>
                      <strong>{c.caseNo}</strong> · opened {formatDateTime(c.openedAt)} ·{' '}
                      {c.visitCount} visit(s)
                      <div className="muted">
                        Balance {formatMoney(c.balance.balanceMinor)}
                        {c.tpa ? ` · ${c.tpa.name}` : ''}
                        {c.isCasualty ? ' · casualty' : ''}
                      </div>
                    </span>
                  </label>
                ))}
                <label
                  className={`option ${caseChoice === NEW_CASE ? 'option-selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="case"
                    checked={caseChoice === NEW_CASE}
                    onChange={() => setCaseChoice(NEW_CASE)}
                  />
                  <span>
                    <strong>Open a new case</strong>
                    <div className="muted">
                      Charges and payments for this visit start a fresh ledger.
                    </div>
                  </span>
                </label>
              </div>
            </>
          )}
        </div>
      </div>

      {/* 3 — visit --------------------------------------------------------- */}
      <div className="card">
        <div className="section">
          <h2>3 · Visit</h2>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="practitionerId">Consultant doctor</label>
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
              <label htmlFor="visitAt">Visit date &amp; time</label>
              <input
                id="visitAt"
                type="datetime-local"
                value={visitAtLocal}
                onChange={(e) => setVisitAtLocal(e.target.value)}
              />
            </div>
          </div>

          <div className="check-row">
            <label>
              <input
                type="checkbox"
                checked={isFollowUp}
                onChange={(e) => setIsFollowUp(e.target.checked)}
              />
              Follow-up (old patient)
            </label>
            <label>
              <input
                type="checkbox"
                checked={isAntenatal}
                onChange={(e) => setIsAntenatal(e.target.checked)}
              />
              Antenatal
            </label>
            <label>
              <input
                type="checkbox"
                checked={isCasualty}
                onChange={(e) => setIsCasualty(e.target.checked)}
              />
              Casualty
            </label>
            <label>
              <input
                type="checkbox"
                checked={isLiveConsult}
                onChange={(e) => setIsLiveConsult(e.target.checked)}
              />
              Live consultation
            </label>
          </div>

          <div className="field">
            <label htmlFor="reference">Reference</label>
            <input
              id="reference"
              placeholder="Referring doctor, camp, walk-in…"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>
        </div>

        <div className="section">
          <h2>Presenting complaint</h2>
          <VisitTermEditor
            label="Symptoms"
            vocabulary="symptoms"
            items={symptoms}
            onChange={setSymptoms}
          />
          <div className="form-grid" style={{ marginTop: 12 }}>
            <div className="field">
              <label htmlFor="knownAllergies">Known allergies</label>
              <textarea
                id="knownAllergies"
                value={knownAllergies}
                onChange={(e) => setKnownAllergies(e.target.value)}
              />
              <span className="hint">Pre-filled from the patient record.</span>
            </div>
            <div className="field">
              <label htmlFor="previousMedicalIssue">Previous medical issue</label>
              <textarea
                id="previousMedicalIssue"
                value={previousMedicalIssue}
                onChange={(e) => setPreviousMedicalIssue(e.target.value)}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="note">Note</label>
            <textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        </div>
      </div>

      {/* 4 — charge -------------------------------------------------------- */}
      <div className="card">
        <div className="section">
          <h2>4 · Consultation charge</h2>
          <div className="check-row">
            <label>
              <input
                type="checkbox"
                checked={billCharge}
                onChange={(e) => setBillCharge(e.target.checked)}
              />
              Bill a charge with this visit
            </label>
          </div>

          {billCharge && (
            <>
              {charge ? (
                <div className="picked" style={{ marginBottom: 12 }}>
                  <span>
                    <span className="picked-title">{charge.name}</span>
                    <div className="muted">
                      {charge.chargeCategory.name}
                      {charge.taxCategory ? ` · ${charge.taxCategory.name}` : ''}
                    </div>
                  </span>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setCharge(null);
                      setChargeDraft(emptyChargeLineDraft);
                    }}
                  >
                    Change charge
                  </button>
                </div>
              ) : (
                <ChargePicker
                  chargeType="opd"
                  onSelect={(c) => {
                    setCharge(c);
                    setChargeDraft(
                      draftForCharge(c.standardChargeMinor, c.taxCategory?.rateBps),
                    );
                  }}
                />
              )}

              {charge && (
                <ChargeLineFields
                  draft={chargeDraft}
                  onChange={setChargeDraft}
                  standardChargeMinor={charge.standardChargeMinor}
                />
              )}
            </>
          )}
        </div>
      </div>

      {/* 5 — payment ------------------------------------------------------- */}
      <div className="card">
        <div className="section">
          <h2>5 · Payment</h2>
          <div className="check-row">
            <label>
              <input
                type="checkbox"
                checked={takePayment}
                onChange={(e) => setTakePayment(e.target.checked)}
              />
              Take a payment now
            </label>
          </div>

          {takePayment && (
            <div className="form-grid-3">
              <div className="field">
                <label htmlFor="paymentMode">Mode</label>
                <select
                  id="paymentMode"
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value as PaymentMode)}
                >
                  {PAYMENT_MODES.map((m) => (
                    <option key={m} value={m}>
                      {PAYMENT_MODE_LABELS[m]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="paymentAmount">Amount</label>
                <input
                  id="paymentAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={paymentAmount}
                  onChange={(e) => {
                    setPaymentTouched(true);
                    setPaymentAmount(e.target.value);
                  }}
                />
                <span className="hint">
                  Net billed {formatMoney(netMinor)} ·{' '}
                  <button
                    type="button"
                    className="link"
                    onClick={() => {
                      setPaymentTouched(false);
                      setPaymentAmount(netMinor > 0 ? String(toMajor(netMinor)) : '');
                    }}
                  >
                    pay in full
                  </button>
                </span>
              </div>
              <div className="field">
                <label htmlFor="paymentNote">Note</label>
                <input
                  id="paymentNote"
                  value={paymentNote}
                  onChange={(e) => setPaymentNote(e.target.value)}
                />
              </div>

              {paymentMode === 'cheque' && (
                <>
                  <div className="field">
                    <label htmlFor="chequeNo">Cheque number</label>
                    <input
                      id="chequeNo"
                      value={chequeNo}
                      onChange={(e) => setChequeNo(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="chequeDate">Cheque date</label>
                    <input
                      id="chequeDate"
                      type="date"
                      value={chequeDate}
                      onChange={(e) => setChequeDate(e.target.value)}
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="row" style={{ marginTop: 16 }}>
        <button type="submit" disabled={mutation.isPending || !patient}>
          {mutation.isPending ? 'Registering…' : 'Register visit'}
        </button>
        <Link to="/opd">
          <button type="button" className="secondary">
            Cancel
          </button>
        </Link>
      </div>
    </form>
  );
}
