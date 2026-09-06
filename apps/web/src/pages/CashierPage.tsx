import { useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PAYMENT_MODE_LABELS,
  approveBillItemSchema,
  createPaymentSchema,
  formatMoney,
  type BillItem,
  type CreatePaymentInput,
  type Payment,
  type PaymentMode,
  type PendingChargeGroup,
} from '@hms/shared';
import { api } from '../lib/api';
import { useCan } from '../lib/permissions';
import { formatDateTime, timeAgo } from '../lib/format';
import { ErrorNote, Loading } from '../components/QueryFeedback';

const HOSPITAL_NAME = import.meta.env.VITE_HOSPITAL_NAME ?? 'Hospital Management System';

const PAYMENT_MODES: PaymentMode[] = [
  'cash',
  'card',
  'bank_transfer',
  'cheque',
  'online',
  'other',
];

interface Invoice {
  receiptNo: string;
  caseNo: string;
  patientName: string;
  paidAt: string;
  mode: PaymentMode;
  lines: BillItem[];
  totalMinor: number;
}

export function CashierPage() {
  const can = useCan();
  const queryClient = useQueryClient();

  const pending = useQuery({
    queryKey: ['billing', 'pending'],
    queryFn: async () => {
      const { data } = await api.get<PendingChargeGroup[]>('/billing/pending');
      return data;
    },
  });

  // longest-waiting patient first
  const groups = useMemo(() => {
    const list = [...(pending.data ?? [])];
    list.sort(
      (a, b) => new Date(a.oldestPendingAt).getTime() - new Date(b.oldestPendingAt).getTime(),
    );
    return list;
  }, [pending.data]);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState<PaymentMode>('cash');
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [payIssue, setPayIssue] = useState<string | null>(null);

  // approve-without-payment, per bill item
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approveReason, setApproveReason] = useState('');
  const [approveIssue, setApproveIssue] = useState<string | null>(null);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['billing', 'pending'] });
    await queryClient.invalidateQueries({ queryKey: ['case', 'ledger'] });
    await queryClient.invalidateQueries({ queryKey: ['orders'] });
    await queryClient.invalidateQueries({ queryKey: ['opd', 'list'] });
  };

  const takePayment = useMutation({
    mutationFn: async (input: { payload: CreatePaymentInput; invoice: Invoice }) => {
      const { data } = await api.post<Payment>('/billing/payments', input.payload);
      return { payment: data, invoice: input.invoice };
    },
    onSuccess: async ({ payment, invoice: draft }) => {
      setInvoice({ ...draft, receiptNo: payment.receiptNo, paidAt: payment.paidAt });
      setSelected({});
      setExpanded(null);
      setPayIssue(null);
      await invalidate();
    },
    onError: (err) =>
      setPayIssue(err instanceof Error ? err.message : 'Could not record the payment'),
  });

  const approve = useMutation({
    mutationFn: async (input: { billItemId: string; reason: string }) => {
      const { data } = await api.post<BillItem>(
        `/billing/bill-items/${input.billItemId}/approve`,
        { reason: input.reason },
      );
      return data;
    },
    onSuccess: async () => {
      setApprovingId(null);
      setApproveReason('');
      setApproveIssue(null);
      await invalidate();
    },
    onError: (err) =>
      setApproveIssue(err instanceof Error ? err.message : 'Could not approve the item'),
  });

  function pendingItems(group: PendingChargeGroup): BillItem[] {
    return group.items.filter((it) => it.status === 'pending');
  }

  function selectedItems(group: PendingChargeGroup): BillItem[] {
    return pendingItems(group).filter((it) => selected[it.id]);
  }

  function onTakePayment(group: PendingChargeGroup) {
    setPayIssue(null);
    const lines = selectedItems(group);
    if (lines.length === 0) {
      setPayIssue('Select at least one item to take payment for.');
      return;
    }
    const totalMinor = lines.reduce((sum, it) => sum + it.netMinor, 0);
    const payload = {
      caseId: group.caseId,
      billItemIds: lines.map((it) => it.id),
      amountMinor: totalMinor,
      mode,
    };
    const parsed = createPaymentSchema.safeParse(payload);
    if (!parsed.success) {
      setPayIssue(parsed.error.issues[0]?.message ?? 'Could not build the payment.');
      return;
    }
    takePayment.mutate({
      payload: parsed.data,
      invoice: {
        receiptNo: '',
        caseNo: group.caseNo,
        patientName: `${group.patient.lastName}, ${group.patient.firstName}`,
        paidAt: new Date().toISOString(),
        mode,
        lines,
        totalMinor,
      },
    });
  }

  function onApprove(billItemId: string) {
    const parsed = approveBillItemSchema.safeParse({ reason: approveReason.trim() });
    if (!parsed.success) {
      setApproveIssue(parsed.error.issues[0]?.message ?? 'A reason is required.');
      return;
    }
    approve.mutate({ billItemId, reason: parsed.data.reason });
  }

  return (
    <>
      <div className="page-head no-print">
        <h1>Cash counter</h1>
        {invoice && (
          <button type="button" className="secondary" onClick={() => window.print()}>
            Print invoice
          </button>
        )}
      </div>

      {invoice && (
        <div className="card receipt" role="status">
          <div className="print-only">
            <h2>{HOSPITAL_NAME}</h2>
          </div>
          <h2 className="no-print">Payment recorded</h2>
          <div>
            Invoice · Receipt {invoice.receiptNo} · Case {invoice.caseNo}
          </div>
          <div>Patient: {invoice.patientName}</div>
          <div>
            {formatDateTime(invoice.paidAt)} · {PAYMENT_MODE_LABELS[invoice.mode]}
          </div>
          <div className="table-wrap" style={{ marginTop: 10 }}>
            <table>
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="num">Qty</th>
                  <th className="num">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lines.map((it) => (
                  <tr key={it.id}>
                    <td>{it.serviceName}</td>
                    <td className="num">{it.quantity}</td>
                    <td className="num">{formatMoney(it.netMinor)}</td>
                  </tr>
                ))}
                <tr>
                  <td colSpan={2}>
                    <strong>Total paid</strong>
                  </td>
                  <td className="num">
                    <strong>{formatMoney(invoice.totalMinor)}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="row no-print" style={{ marginTop: 10 }}>
            <button type="button" className="secondary" onClick={() => setInvoice(null)}>
              Back to queue
            </button>
          </div>
        </div>
      )}

      <div className="no-print">
        <ErrorNote error={pending.error} fallback="Could not load the pending-charges queue" />
        {pending.isPending && <Loading label="Loading pending charges…" />}
        {payIssue && (
          <div className="alert" role="alert">
            {payIssue}
          </div>
        )}
        <ErrorNote error={takePayment.error} fallback="Could not record the payment" />

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Case</th>
                <th>Patient</th>
                <th>Waiting</th>
                <th className="num">Pending items</th>
                <th className="num">Pending amount</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => {
                const isOpen = expanded === g.caseId;
                const items = pendingItems(g);
                const chosen = items.filter((it) => selected[it.id]);
                const runningTotal = chosen.reduce((sum, it) => sum + it.netMinor, 0);
                return (
                  <FragmentRow key={g.caseId}>
                    <tr>
                      <td>{g.caseNo}</td>
                      <td>
                        {g.patient.lastName}, {g.patient.firstName}
                        <div className="muted">{g.patient.mrn}</div>
                      </td>
                      <td>{timeAgo(g.oldestPendingAt)}</td>
                      <td className="num">{g.pendingCount}</td>
                      <td className="num">{formatMoney(g.pendingMinor)}</td>
                      <td>
                        <button
                          type="button"
                          className="secondary"
                          onClick={() => {
                            setExpanded(isOpen ? null : g.caseId);
                            setPayIssue(null);
                          }}
                        >
                          {isOpen ? 'Hide' : 'Open'}
                        </button>
                      </td>
                    </tr>
                    {isOpen && (
                      <tr>
                        <td colSpan={6}>
                          <div className="table-wrap">
                            <table>
                              <thead>
                                <tr>
                                  <th />
                                  <th>Item</th>
                                  <th>Charged</th>
                                  <th className="num">Qty</th>
                                  <th className="num">Net</th>
                                  <th>Payment</th>
                                </tr>
                              </thead>
                              <tbody>
                                {items.map((it) => (
                                  <FragmentRow key={it.id}>
                                    <tr>
                                      <td>
                                        <input
                                          type="checkbox"
                                          aria-label={`Select ${it.serviceName}`}
                                          checked={Boolean(selected[it.id])}
                                          onChange={(e) =>
                                            setSelected((prev) => ({
                                              ...prev,
                                              [it.id]: e.target.checked,
                                            }))
                                          }
                                        />
                                      </td>
                                      <td>
                                        {it.serviceName}
                                        {it.note ? (
                                          <div className="muted">{it.note}</div>
                                        ) : null}
                                      </td>
                                      <td>{formatDateTime(it.chargedAt)}</td>
                                      <td className="num">{it.quantity}</td>
                                      <td className="num">{formatMoney(it.netMinor)}</td>
                                      <td>
                                        {can('bill:approve') && (
                                          <button
                                            type="button"
                                            className="link"
                                            onClick={() => {
                                              setApprovingId(
                                                approvingId === it.id ? null : it.id,
                                              );
                                              setApproveReason('');
                                              setApproveIssue(null);
                                            }}
                                          >
                                            Approve without payment
                                          </button>
                                        )}
                                      </td>
                                    </tr>
                                    {approvingId === it.id && (
                                      <tr>
                                        <td colSpan={6}>
                                          {approveIssue && (
                                            <div className="alert" role="alert">
                                              {approveIssue}
                                            </div>
                                          )}
                                          <ErrorNote
                                            error={approve.error}
                                            fallback="Could not approve the item"
                                          />
                                          <div className="row">
                                            <input
                                              placeholder="Reason (required) — panel patient, waiver…"
                                              value={approveReason}
                                              onChange={(e) =>
                                                setApproveReason(e.target.value)
                                              }
                                              aria-label="Approval reason"
                                              style={{ maxWidth: 420 }}
                                            />
                                            <button
                                              type="button"
                                              disabled={approve.isPending}
                                              onClick={() => onApprove(it.id)}
                                            >
                                              Confirm approval
                                            </button>
                                            <button
                                              type="button"
                                              className="secondary"
                                              onClick={() => {
                                                setApprovingId(null);
                                                setApproveReason('');
                                                setApproveIssue(null);
                                              }}
                                            >
                                              Cancel
                                            </button>
                                          </div>
                                        </td>
                                      </tr>
                                    )}
                                  </FragmentRow>
                                ))}
                                {items.length === 0 && (
                                  <tr>
                                    <td colSpan={6} className="muted">
                                      Nothing pending on this case.
                                    </td>
                                  </tr>
                                )}
                              </tbody>
                            </table>
                          </div>

                          {can('payment:create') && items.length > 0 && (
                            <div className="row" style={{ marginTop: 12 }}>
                              <div className="field" style={{ marginBottom: 0, maxWidth: 180 }}>
                                <label htmlFor={`mode-${g.caseId}`}>Mode</label>
                                <select
                                  id={`mode-${g.caseId}`}
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
                              <span className="muted">
                                {chosen.length} selected · total{' '}
                                <strong>{formatMoney(runningTotal)}</strong>
                              </span>
                              <button
                                type="button"
                                disabled={takePayment.isPending || chosen.length === 0}
                                onClick={() => onTakePayment(g)}
                              >
                                Take payment
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </FragmentRow>
                );
              })}
              {pending.data && groups.length === 0 && (
                <tr>
                  <td colSpan={6} className="muted">
                    No patients with outstanding charges.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/** Group sibling <tr>s without wrapping them in an element the table rejects. */
function FragmentRow({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
