import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import {
  PAYMENT_MODE_LABELS,
  addChargeItemSchema,
  createPaymentSchema,
  formatBps,
  formatMoney,
  reversePaymentSchema,
  toMajor,
  toMinor,
  type AddChargeItemInput,
  type Case,
  type CaseLedger,
  type Charge,
  type CreatePaymentInput,
  type PaymentMode,
} from '@hms/shared';
import { api } from '../lib/api';
import { useCan } from '../lib/permissions';
import {
  chargeLinePayload,
  chargeLineTotals,
  draftForCharge,
  emptyChargeLineDraft,
  num,
  type ChargeLineDraft,
} from '../lib/charge-line';
import { blankToUndefined, formatDateTime } from '../lib/format';
import { ChargeLineFields } from '../components/ChargeLineFields';
import { ChargePicker } from '../components/ChargePicker';
import { ErrorNote, Loading } from '../components/QueryFeedback';

/** No hospital name reaches the client from the contract; allow an env override. */
const HOSPITAL_NAME = import.meta.env.VITE_HOSPITAL_NAME ?? 'Hospital Management System';

const PAYMENT_MODES: PaymentMode[] = [
  'cash',
  'card',
  'bank_transfer',
  'cheque',
  'online',
  'other',
];

export function CaseBillingPage() {
  const { id = '' } = useParams();
  const can = useCan();
  const queryClient = useQueryClient();

  const ledger = useQuery({
    // Ledger shape — distinct from ['case','detail',id] and every other key.
    queryKey: ['case', 'ledger', id],
    queryFn: async () => {
      const { data } = await api.get<CaseLedger>(`/billing/cases/${id}/ledger`);
      return data;
    },
    enabled: Boolean(id),
  });

  const caseInfo = useQuery({
    // Case header — used for the patient identity on the printed receipt.
    queryKey: ['case', 'detail', id],
    queryFn: async () => {
      const { data } = await api.get<Case>(`/cases/${id}`);
      return data;
    },
    enabled: Boolean(id),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['case', 'ledger', id] });
    await queryClient.invalidateQueries({ queryKey: ['opd', 'list'] });
    await queryClient.invalidateQueries({ queryKey: ['opd', 'visit'] });
  };

  // --- add charge --------------------------------------------------------------
  const [charge, setCharge] = useState<Charge | null>(null);
  const [chargeDraft, setChargeDraft] = useState<ChargeLineDraft>(emptyChargeLineDraft);
  const [chargeNote, setChargeNote] = useState('');
  const [chargeIssues, setChargeIssues] = useState<string[]>([]);
  const chargeTotals = useMemo(() => chargeLineTotals(chargeDraft), [chargeDraft]);

  const addCharge = useMutation({
    mutationFn: async (payload: AddChargeItemInput) => {
      const { data } = await api.post('/billing/charge-items', payload);
      return data;
    },
    onSuccess: async () => {
      setCharge(null);
      setChargeDraft(emptyChargeLineDraft);
      setChargeNote('');
      setChargeIssues([]);
      await invalidate();
    },
  });

  function onAddCharge(event: FormEvent) {
    event.preventDefault();
    setChargeIssues([]);
    if (!charge) {
      setChargeIssues(['Pick a charge first.']);
      return;
    }
    const payload = {
      caseId: id,
      ...chargeLinePayload(chargeDraft, charge.id),
      note: blankToUndefined(chargeNote),
    };
    const parsed = addChargeItemSchema.safeParse(payload);
    if (!parsed.success) {
      setChargeIssues(
        parsed.error.issues.map((i) =>
          i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message,
        ),
      );
      return;
    }
    addCharge.mutate(parsed.data);
  }

  const deleteCharge = useMutation({
    mutationFn: async (itemId: string) => {
      await api.delete(`/billing/charge-items/${itemId}`);
    },
    onSuccess: invalidate,
  });

  // --- take payment ---------------------------------------------------------
  const [mode, setMode] = useState<PaymentMode>('cash');
  const [amount, setAmount] = useState('');
  const [payNote, setPayNote] = useState('');
  const [chequeNo, setChequeNo] = useState('');
  const [chequeDate, setChequeDate] = useState('');
  const [payIssues, setPayIssues] = useState<string[]>([]);

  const takePayment = useMutation({
    mutationFn: async (payload: CreatePaymentInput) => {
      const { data } = await api.post('/billing/payments', payload);
      return data;
    },
    onSuccess: async () => {
      setAmount('');
      setPayNote('');
      setChequeNo('');
      setChequeDate('');
      setPayIssues([]);
      await invalidate();
    },
  });

  function onTakePayment(event: FormEvent) {
    event.preventDefault();
    setPayIssues([]);
    const payload = {
      caseId: id,
      amountMinor: toMinor(num(amount)),
      mode,
      note: blankToUndefined(payNote),
      chequeNo: mode === 'cheque' ? blankToUndefined(chequeNo) : undefined,
      chequeDate: mode === 'cheque' ? blankToUndefined(chequeDate) : undefined,
    };
    const parsed = createPaymentSchema.safeParse(payload);
    if (!parsed.success) {
      setPayIssues(
        parsed.error.issues.map((i) =>
          i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message,
        ),
      );
      return;
    }
    takePayment.mutate(parsed.data);
  }

  // --- reverse payment ----------------------------------------------------------
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [reverseReason, setReverseReason] = useState('');
  const [reverseIssue, setReverseIssue] = useState<string | null>(null);

  const reversePayment = useMutation({
    mutationFn: async (input: { paymentId: string; reason: string }) => {
      await api.post(`/billing/payments/${input.paymentId}/reverse`, {
        reason: input.reason,
      });
    },
    onSuccess: async () => {
      setReversingId(null);
      setReverseReason('');
      setReverseIssue(null);
      await invalidate();
    },
  });

  function onReverse(paymentId: string) {
    const parsed = reversePaymentSchema.safeParse({ reason: reverseReason.trim() });
    if (!parsed.success) {
      setReverseIssue(parsed.error.issues[0]?.message ?? 'A reason is required');
      return;
    }
    reversePayment.mutate({ paymentId, reason: parsed.data.reason });
  }

  if (ledger.isPending) return <Loading label="Loading ledger…" />;
  if (ledger.isError)
    return <ErrorNote error={ledger.error} fallback="Could not load the case ledger" />;
  if (!ledger.data) return null;

  const l = ledger.data;
  const cur = l.currency || 'PKR';
  const patient = caseInfo.data?.patient;

  return (
    <>
      <div className="page-head no-print">
        <h1>Billing · {l.caseNo}</h1>
        <div className="row">
          <button type="button" className="secondary" onClick={() => window.print()}>
            Print receipt
          </button>
        </div>
      </div>

      {/* Printed receipt header — hidden on screen, shown on paper. */}
      <div className="print-only receipt">
        <h2>{HOSPITAL_NAME}</h2>
        <div>Receipt · Case {l.caseNo}</div>
        {patient && (
          <div>
            Patient: {patient.lastName}, {patient.firstName} · MRN {patient.mrn}
          </div>
        )}
        <div>{formatDateTime(new Date().toISOString())}</div>
      </div>

      <ErrorNote error={caseInfo.error} fallback="Could not load case details" />

      <div className="split">
        <div>
          {/* charge items ------------------------------------------------------ */}
          <div className="card">
            <div className="section">
              <h2>Charge items</h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th className="num">Qty</th>
                      <th className="num">Applied</th>
                      <th className="num">Discount</th>
                      <th className="num">Tax</th>
                      <th className="num">Net</th>
                      <th className="no-print" />
                    </tr>
                  </thead>
                  <tbody>
                    {l.items.map((it) => (
                      <tr key={it.id}>
                        <td>
                          {it.chargeName}
                          {it.note ? <div className="muted">{it.note}</div> : null}
                        </td>
                        <td className="num">{it.quantity}</td>
                        <td className="num">{formatMoney(it.appliedChargeMinor, cur)}</td>
                        <td className="num">
                          {it.discountMinor > 0 ? `-${formatMoney(it.discountMinor, cur)}` : '—'}
                          {it.discountBps > 0 ? (
                            <div className="muted">{formatBps(it.discountBps)}</div>
                          ) : null}
                        </td>
                        <td className="num">
                          {formatMoney(it.taxMinor, cur)}
                          {it.taxBps > 0 ? (
                            <div className="muted">{formatBps(it.taxBps)}</div>
                          ) : null}
                        </td>
                        <td className="num">{formatMoney(it.netMinor, cur)}</td>
                        <td className="no-print">
                          {can('charge:delete') && (
                            <button
                              type="button"
                              className="secondary"
                              disabled={deleteCharge.isPending}
                              onClick={() => deleteCharge.mutate(it.id)}
                            >
                              Delete
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {l.items.length === 0 && (
                      <tr>
                        <td colSpan={7} className="muted">
                          No charges on this case yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <ErrorNote error={deleteCharge.error} fallback="Could not delete the line" />
            </div>

            {can('charge:create') && (
              <div className="section no-print">
                <h2>Add a charge</h2>
                {chargeIssues.length > 0 && (
                  <div className="alert" role="alert">
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {chargeIssues.map((i) => (
                        <li key={i}>{i}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <ErrorNote error={addCharge.error} fallback="Could not add the charge" />
                <form onSubmit={onAddCharge} noValidate>
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
                      onSelect={(c) => {
                        setCharge(c);
                        setChargeDraft(
                          draftForCharge(c.standardChargeMinor, c.taxCategory?.rateBps),
                        );
                      }}
                    />
                  )}

                  {charge && (
                    <>
                      <ChargeLineFields
                        draft={chargeDraft}
                        onChange={setChargeDraft}
                        standardChargeMinor={charge.standardChargeMinor}
                        currency={cur}
                      />
                      <div className="field" style={{ marginTop: 12 }}>
                        <label htmlFor="chargeNote">Note</label>
                        <input
                          id="chargeNote"
                          value={chargeNote}
                          onChange={(e) => setChargeNote(e.target.value)}
                        />
                      </div>
                      <div className="row" style={{ marginTop: 8 }}>
                        <button type="submit" disabled={addCharge.isPending}>
                          {addCharge.isPending ? 'Adding…' : 'Add charge'}
                        </button>
                        <span className="muted">
                          Net to add {formatMoney(chargeTotals.netMinor, cur)}
                        </span>
                      </div>
                    </>
                  )}
                </form>
              </div>
            )}
          </div>

          {/* payments -------------------------------------------------------- */}
          <div className="card">
            <div className="section">
              <h2>Payments</h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Receipt</th>
                      <th>Mode</th>
                      <th>Paid at</th>
                      <th className="num">Amount</th>
                      <th className="no-print" />
                    </tr>
                  </thead>
                  <tbody>
                    {l.payments.map((p) => (
                      <tr key={p.id} className={p.reversedAt ? 'is-reversed' : undefined}>
                        <td>{p.receiptNo}</td>
                        <td>
                          {PAYMENT_MODE_LABELS[p.mode]}
                          {p.chequeNo ? <div className="muted">Cheque {p.chequeNo}</div> : null}
                        </td>
                        <td>
                          {formatDateTime(p.paidAt)}
                          {p.reversedAt ? (
                            <div className="muted">
                              Reversed {formatDateTime(p.reversedAt)}
                              {p.reversalReason ? ` — ${p.reversalReason}` : ''}
                            </div>
                          ) : null}
                        </td>
                        <td className="num">{formatMoney(p.amountMinor, cur)}</td>
                        <td className="no-print">
                          {can('payment:reverse') && !p.reversedAt && (
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => {
                                setReversingId(p.id);
                                setReverseReason('');
                                setReverseIssue(null);
                              }}
                            >
                              Reverse
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {l.payments.length === 0 && (
                      <tr>
                        <td colSpan={5} className="muted">
                          No payments recorded.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {reversingId && (
                <div className="no-print" style={{ marginTop: 10 }}>
                  {reverseIssue && (
                    <div className="alert" role="alert">
                      {reverseIssue}
                    </div>
                  )}
                  <ErrorNote
                    error={reversePayment.error}
                    fallback="Could not reverse the payment"
                  />
                  <div className="row">
                    <input
                      placeholder="Reason for reversal"
                      value={reverseReason}
                      onChange={(e) => setReverseReason(e.target.value)}
                      aria-label="Reversal reason"
                      style={{ maxWidth: 360 }}
                    />
                    <button
                      type="button"
                      className="danger"
                      disabled={reversePayment.isPending}
                      onClick={() => onReverse(reversingId)}
                    >
                      Confirm reversal
                    </button>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => {
                        setReversingId(null);
                        setReverseReason('');
                        setReverseIssue(null);
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {can('payment:create') && (
              <div className="section no-print">
                <h2>Take a payment</h2>
                {payIssues.length > 0 && (
                  <div className="alert" role="alert">
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {payIssues.map((i) => (
                        <li key={i}>{i}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <ErrorNote error={takePayment.error} fallback="Could not record the payment" />
                <form onSubmit={onTakePayment} noValidate>
                  <div className="form-grid-3">
                    <div className="field">
                      <label htmlFor="payMode">Mode</label>
                      <select
                        id="payMode"
                        value={mode}
                        onChange={(e) => setMode(e.target.value as PaymentMode)}
                      >
                        {PAYMENT_MODES.map((m) => (
                          <option key={m} value={m}>
                            {PAYMENT_MODE_LABELS[m]}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="payAmount">Amount ({cur})</label>
                      <input
                        id="payAmount"
                        type="number"
                        min="0"
                        step="0.01"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                      />
                      <span className="hint">
                        Balance {formatMoney(l.balanceMinor, cur)} ·{' '}
                        <button
                          type="button"
                          className="link"
                          onClick={() =>
                            setAmount(
                              l.balanceMinor > 0 ? String(toMajor(l.balanceMinor)) : '',
                            )
                          }
                        >
                          pay balance
                        </button>
                      </span>
                    </div>
                    <div className="field">
                      <label htmlFor="payNote">Note</label>
                      <input
                        id="payNote"
                        value={payNote}
                        onChange={(e) => setPayNote(e.target.value)}
                      />
                    </div>
                    {mode === 'cheque' && (
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
                  <div className="row" style={{ marginTop: 8 }}>
                    <button type="submit" disabled={takePayment.isPending}>
                      {takePayment.isPending ? 'Recording…' : 'Record payment'}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>

        {/* totals ---------------------------------------------------------- */}
        <div className="card">
          <div className="section">
            <h2>Totals</h2>
            <dl className="totals">
              <dt>Gross</dt>
              <dd>{formatMoney(l.grossMinor, cur)}</dd>
              <dt>Discount</dt>
              <dd>-{formatMoney(l.discountMinor, cur)}</dd>
              <dt>Tax</dt>
              <dd>{formatMoney(l.taxMinor, cur)}</dd>
              <div className="totals-divider" />
              <dt>Net</dt>
              <dd>{formatMoney(l.netMinor, cur)}</dd>
              <dt>Paid</dt>
              <dd>{formatMoney(l.paidMinor, cur)}</dd>
              <div className="totals-divider" />
              <div className="total-row" style={{ display: 'contents' }}>
                <dt>Balance</dt>
                <dd className={l.balanceMinor > 0 ? 'balance-due' : 'balance-clear'}>
                  {formatMoney(l.balanceMinor, cur)}
                </dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </>
  );
}
