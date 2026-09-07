import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import {
  PAYMENT_MODE_LABELS,
  SERVICE_DEPARTMENT_LABELS,
  addBillItemSchema,
  createPaymentSchema,
  formatBps,
  formatMoney,
  reversePaymentSchema,
  toMajor,
  toMinor,
  type AddBillItemInput,
  type Case,
  type CaseLedger,
  type CreatePaymentInput,
  type PaymentMode,
  type Service,
} from '@hms/shared';
import { api } from '../lib/api';
import { useCan } from '../lib/permissions';
import {
  billLinePayload,
  billLineTotals,
  draftForService,
  emptyBillLineDraft,
  num,
  type BillLineDraft,
} from '../lib/bill-line';
import { blankToUndefined, formatDateTime } from '../lib/format';
import { BillLineFields } from '../components/BillLineFields';
import { ServicePicker } from '../components/ServicePicker';
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

  // --- add item -------------------------------------------------------------
  const [service, setService] = useState<Service | null>(null);
  const [typedName, setTypedName] = useState('');
  const [itemDraft, setItemDraft] = useState<BillLineDraft>(emptyBillLineDraft);
  const [itemNote, setItemNote] = useState('');
  const [itemIssues, setItemIssues] = useState<string[]>([]);
  const itemTotals = useMemo(() => billLineTotals(itemDraft), [itemDraft]);
  const hasSelection = Boolean(service) || typedName.trim() !== '';

  function resetItemForm() {
    setService(null);
    setTypedName('');
    setItemDraft(emptyBillLineDraft);
    setItemNote('');
    setItemIssues([]);
  }

  const addItem = useMutation({
    mutationFn: async (payload: AddBillItemInput) => {
      const { data } = await api.post('/billing/bill-items', payload);
      return data;
    },
    onSuccess: async () => {
      resetItemForm();
      await invalidate();
    },
  });

  function onAddItem(event: FormEvent) {
    event.preventDefault();
    setItemIssues([]);
    if (!hasSelection) {
      setItemIssues(['Pick a service or type a name first.']);
      return;
    }
    const payload = {
      caseId: id,
      serviceId: service?.id,
      serviceName: service ? undefined : typedName.trim(),
      department: service?.department ?? undefined,
      ...billLinePayload(itemDraft),
      note: blankToUndefined(itemNote),
    };
    const parsed = addBillItemSchema.safeParse(payload);
    if (!parsed.success) {
      setItemIssues(
        parsed.error.issues.map((i) =>
          i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message,
        ),
      );
      return;
    }
    addItem.mutate(parsed.data);
  }

  const deleteItem = useMutation({
    mutationFn: async (itemId: string) => {
      await api.delete(`/billing/bill-items/${itemId}`);
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
          {/* bill items ------------------------------------------------------ */}
          <div className="card">
            <div className="section">
              <h2>Items</h2>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Service</th>
                      <th className="num">Qty</th>
                      <th className="num">Price</th>
                      <th className="num">Discount</th>
                      <th className="num">Net</th>
                      <th className="no-print" />
                    </tr>
                  </thead>
                  <tbody>
                    {l.items.map((it) => (
                      <tr key={it.id}>
                        <td>
                          {it.serviceName}
                          {it.note ? <div className="muted">{it.note}</div> : null}
                          {it.discountReason ? (
                            <div className="muted">Concession: {it.discountReason}</div>
                          ) : null}
                        </td>
                        <td className="num">{it.quantity}</td>
                        <td className="num">{formatMoney(it.priceMinor, cur)}</td>
                        <td className="num">
                          {it.discountMinor > 0 ? `-${formatMoney(it.discountMinor, cur)}` : '—'}
                          {it.discountBps > 0 ? (
                            <div className="muted">{formatBps(it.discountBps)}</div>
                          ) : null}
                        </td>
                        <td className="num">{formatMoney(it.netMinor, cur)}</td>
                        <td className="no-print">
                          {can('bill:delete') && (
                            <button
                              type="button"
                              className="secondary"
                              disabled={deleteItem.isPending}
                              onClick={() => deleteItem.mutate(it.id)}
                            >
                              Delete
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {l.items.length === 0 && (
                      <tr>
                        <td colSpan={6} className="muted">
                          No items on this case yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <ErrorNote error={deleteItem.error} fallback="Could not delete the line" />
            </div>

            {can('bill:create') && (
              <div className="section no-print">
                <h2>Add an item</h2>
                {itemIssues.length > 0 && (
                  <div className="alert" role="alert">
                    <ul style={{ margin: 0, paddingLeft: 18 }}>
                      {itemIssues.map((i) => (
                        <li key={i}>{i}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <ErrorNote error={addItem.error} fallback="Could not add the item" />
                <form onSubmit={onAddItem} noValidate>
                  {hasSelection ? (
                    <div className="picked" style={{ marginBottom: 12 }}>
                      <span>
                        <span className="picked-title">
                          {service ? service.name : typedName.trim()}
                        </span>
                        <div className="muted">
                          {service
                            ? service.department
                              ? SERVICE_DEPARTMENT_LABELS[service.department]
                              : 'Service'
                            : 'One-off item'}
                        </div>
                      </span>
                      <button
                        type="button"
                        className="secondary"
                        onClick={resetItemForm}
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    <ServicePicker
                      onSelect={(s) => {
                        setService(s);
                        setTypedName('');
                        setItemDraft(draftForService(s.defaultPriceMinor));
                      }}
                      onSubmitText={(nm) => {
                        setService(null);
                        setTypedName(nm);
                        setItemDraft(emptyBillLineDraft);
                      }}
                    />
                  )}

                  {hasSelection && (
                    <>
                      <BillLineFields
                        draft={itemDraft}
                        onChange={setItemDraft}
                        suggestedPriceMinor={service?.defaultPriceMinor ?? null}
                        currency={cur}
                      />
                      <div className="field" style={{ marginTop: 12 }}>
                        <label htmlFor="itemNote">Note</label>
                        <input
                          id="itemNote"
                          value={itemNote}
                          onChange={(e) => setItemNote(e.target.value)}
                        />
                      </div>
                      <div className="row" style={{ marginTop: 8 }}>
                        <button type="submit" disabled={addItem.isPending}>
                          {addItem.isPending ? 'Adding…' : 'Add item'}
                        </button>
                        <span className="muted">
                          Net to add {formatMoney(itemTotals.netMinor, cur)}
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
