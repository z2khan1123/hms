import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  bpsOf,
  createReferralPaymentSchema,
  createReferrerSchema,
  formatBps,
  formatMoney,
  percentToBps,
  toMinor,
  updateReferrerSchema,
  type CreateReferralPaymentInput,
  type CreateReferrerInput,
  type Referrer,
  type ReferralPayment,
} from '@hms/shared';
import { api } from '../lib/api';
import { useCan } from '../lib/permissions';
import { num } from '../lib/bill-line';
import {
  blankToUndefined,
  formatDate,
  formatDateTime,
  localInputToIso,
  toLocalInput,
} from '../lib/format';
import { ErrorNote, Loading } from '../components/QueryFeedback';

function zodMessage(error: {
  issues: { message: string; path: (string | number)[] }[];
}): string {
  const first = error.issues[0];
  if (!first) return 'Check the values';
  return first.path.length ? `${first.path.join('.')}: ${first.message}` : first.message;
}

/** commissionBps -> percent string for an editable input. */
function bpsToPercentInput(bps: number | null): string {
  return bps == null ? '' : String(bps / 100);
}

export function ReferralsPage() {
  const can = useCan();
  const canManage = can('referral:manage');
  const queryClient = useQueryClient();

  const referrers = useQuery({
    // Referrer[] with rolled-up case count, referred billing and paid total.
    queryKey: ['referrals', 'referrers', 'list'],
    queryFn: async () => {
      const { data } = await api.get<Referrer[]>('/referrals/referrers');
      return data;
    },
  });

  const payments = useQuery({
    // ReferralPayment[] — the payout history.
    queryKey: ['referrals', 'payments', 'list'],
    queryFn: async () => {
      const { data } = await api.get<ReferralPayment[]>('/referrals/payments');
      return data;
    },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['referrals'] });

  // --- create referrer -----------------------------------------------
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [category, setCategory] = useState('');
  const [ratePct, setRatePct] = useState('');
  const [formErr, setFormErr] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async (payload: CreateReferrerInput) => {
      const { data } = await api.post<Referrer>('/referrals/referrers', payload);
      return data;
    },
    onSuccess: async () => {
      setName('');
      setPhone('');
      setCategory('');
      setRatePct('');
      setFormErr(null);
      await invalidate();
    },
  });

  function onCreate(event: FormEvent) {
    event.preventDefault();
    const parsed = createReferrerSchema.safeParse({
      name: name.trim(),
      phone: blankToUndefined(phone),
      category: blankToUndefined(category),
      commissionBps: ratePct.trim() ? percentToBps(num(ratePct)) : undefined,
    });
    if (!parsed.success) {
      setFormErr(zodMessage(parsed.error));
      return;
    }
    setFormErr(null);
    create.mutate(parsed.data);
  }

  const update = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Record<string, unknown>;
    }) => {
      const { data } = await api.patch<Referrer>(
        `/referrals/referrers/${id}`,
        patch,
      );
      return data;
    },
    onSuccess: invalidate,
  });

  const pay = useMutation({
    mutationFn: async (payload: CreateReferralPaymentInput) => {
      const { data } = await api.post<ReferralPayment>(
        '/referrals/payments',
        payload,
      );
      return data;
    },
    onSuccess: async () => {
      setPayFor(null);
      await invalidate();
    },
  });

  const [payFor, setPayFor] = useState<Referrer | null>(null);

  const rows = referrers.data ?? [];
  const rowBusy = update.isPending;

  return (
    <>
      <div className="page-head">
        <h1>Referrals</h1>
      </div>

      <div className="card">
        <div className="section">
          <h2>Referrers</h2>
          <p className="muted">
            <strong>Suggested commission</strong> is the referrer&rsquo;s rate
            applied to the net billing of the cases they referred. It is a guide
            only — the hospital decides what it actually pays, shown under{' '}
            <strong>Paid</strong>.
          </p>

          <ErrorNote error={referrers.error} fallback="Could not load referrers" />
          <ErrorNote error={update.error} fallback="Could not update the referrer" />
          {referrers.isPending && <Loading label="Loading referrers…" />}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th className="num">Cases</th>
                  <th className="num">Referred net billing</th>
                  <th className="num">Rate</th>
                  <th className="num">Suggested commission</th>
                  <th className="num">Paid</th>
                  {canManage && <th className="no-print" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <ReferrerRow
                    key={r.id}
                    referrer={r}
                    canManage={canManage}
                    busy={rowBusy}
                    onSave={(patch) => update.mutate({ id: r.id, patch })}
                    onToggle={() =>
                      update.mutate({
                        id: r.id,
                        patch: { isActive: !r.isActive },
                      })
                    }
                    onPay={() => setPayFor(r)}
                  />
                ))}
                {referrers.data && rows.length === 0 && (
                  <tr>
                    <td colSpan={canManage ? 7 : 6} className="muted">
                      No referrers yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {canManage && payFor && (
        <PaymentForm
          referrer={payFor}
          busy={pay.isPending}
          error={pay.error}
          onCancel={() => setPayFor(null)}
          onSubmit={(payload) => pay.mutate(payload)}
        />
      )}

      {canManage && (
        <div className="card">
          <div className="section">
            <h2>New referrer</h2>
            {formErr && (
              <div className="alert" role="alert">
                {formErr}
              </div>
            )}
            <ErrorNote error={create.error} fallback="Could not create the referrer" />
            <form onSubmit={onCreate} noValidate>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="ref-name">Name</label>
                  <input
                    id="ref-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="ref-phone">
                    Phone <span className="muted">(optional)</span>
                  </label>
                  <input
                    id="ref-phone"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="ref-cat">
                    Category <span className="muted">(optional)</span>
                  </label>
                  <input
                    id="ref-cat"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="ref-rate">
                    Commission rate % <span className="muted">(optional)</span>
                  </label>
                  <input
                    id="ref-rate"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={ratePct}
                    onChange={(e) => setRatePct(e.target.value)}
                  />
                  <span className="hint">
                    Feeds the suggested commission only.
                  </span>
                </div>
              </div>
              <button type="submit" disabled={create.isPending}>
                {create.isPending ? 'Creating…' : 'Create referrer'}
              </button>
            </form>
          </div>
        </div>
      )}

      <div className="card">
        <div className="section">
          <h2>Payments</h2>
          <ErrorNote error={payments.error} fallback="Could not load payments" />
          {payments.isPending && <Loading label="Loading payments…" />}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Referrer</th>
                  <th className="num">Amount</th>
                  <th>Paid</th>
                  <th>Period</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {(payments.data ?? []).map((p) => (
                  <tr key={p.id}>
                    <td>{p.referrerName}</td>
                    <td className="num">{formatMoney(p.amountMinor)}</td>
                    <td>{formatDateTime(p.paidAt)}</td>
                    <td>
                      {p.periodFrom || p.periodTo ? (
                        `${p.periodFrom ? formatDate(p.periodFrom) : '…'} – ${
                          p.periodTo ? formatDate(p.periodTo) : '…'
                        }`
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td>{p.note ?? <span className="muted">—</span>}</td>
                  </tr>
                ))}
                {payments.data && payments.data.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted">
                      No payments recorded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

function ReferrerRow({
  referrer,
  canManage,
  busy,
  onSave,
  onToggle,
  onPay,
}: {
  referrer: Referrer;
  canManage: boolean;
  busy: boolean;
  onSave: (patch: Record<string, unknown>) => void;
  onToggle: () => void;
  onPay: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(referrer.name);
  const [phone, setPhone] = useState(referrer.phone ?? '');
  const [category, setCategory] = useState(referrer.category ?? '');
  const [ratePct, setRatePct] = useState(bpsToPercentInput(referrer.commissionBps));
  const [err, setErr] = useState<string | null>(null);

  const suggestedMinor =
    referrer.commissionBps != null
      ? bpsOf(referrer.referredNetMinor, referrer.commissionBps)
      : null;

  function startEditing() {
    setName(referrer.name);
    setPhone(referrer.phone ?? '');
    setCategory(referrer.category ?? '');
    setRatePct(bpsToPercentInput(referrer.commissionBps));
    setErr(null);
    setEditing(true);
  }

  function save() {
    const parsed = updateReferrerSchema.safeParse({
      name: name.trim(),
      phone: blankToUndefined(phone) ?? null,
      category: blankToUndefined(category) ?? null,
      commissionBps: ratePct.trim() ? percentToBps(num(ratePct)) : null,
    });
    if (!parsed.success) {
      setErr(zodMessage(parsed.error));
      return;
    }
    onSave(parsed.data);
    setEditing(false);
  }

  if (!editing) {
    return (
      <tr>
        <td>
          {referrer.name}
          {!referrer.isActive && <span className="muted"> (inactive)</span>}
          <div className="muted">
            {[referrer.category, referrer.phone].filter(Boolean).join(' · ') || '—'}
          </div>
        </td>
        <td className="num">{referrer.caseCount}</td>
        <td className="num">{formatMoney(referrer.referredNetMinor)}</td>
        <td className="num">
          {referrer.commissionBps != null
            ? formatBps(referrer.commissionBps)
            : '—'}
        </td>
        <td className="num">
          {suggestedMinor != null ? (
            <>
              {formatMoney(suggestedMinor)}{' '}
              <span className="muted">(suggested)</span>
            </>
          ) : (
            <span className="muted">—</span>
          )}
        </td>
        <td className="num">{formatMoney(referrer.paidMinor)}</td>
        {canManage && (
          <td className="no-print">
            <div className="row">
              <button type="button" className="secondary" onClick={startEditing}>
                Edit
              </button>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={onToggle}
              >
                {referrer.isActive ? 'Deactivate' : 'Activate'}
              </button>
              <button type="button" onClick={onPay}>
                Record payment
              </button>
            </div>
          </td>
        )}
      </tr>
    );
  }

  return (
    <tr>
      <td>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Referrer name"
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          aria-label="Phone"
          placeholder="Phone"
          style={{ marginTop: 4 }}
        />
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          aria-label="Category"
          placeholder="Category"
          style={{ marginTop: 4 }}
        />
        {err && <div className="hint">{err}</div>}
      </td>
      <td className="num">{referrer.caseCount}</td>
      <td className="num">{formatMoney(referrer.referredNetMinor)}</td>
      <td className="num">
        <input
          type="number"
          min="0"
          max="100"
          step="0.01"
          value={ratePct}
          onChange={(e) => setRatePct(e.target.value)}
          aria-label="Commission rate percent"
        />
      </td>
      <td className="num">
        {suggestedMinor != null ? formatMoney(suggestedMinor) : '—'}
      </td>
      <td className="num">{formatMoney(referrer.paidMinor)}</td>
      <td className="no-print">
        <div className="row">
          <button type="button" disabled={busy} onClick={save}>
            Save
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => setEditing(false)}
          >
            Cancel
          </button>
        </div>
      </td>
    </tr>
  );
}

function PaymentForm({
  referrer,
  busy,
  error,
  onCancel,
  onSubmit,
}: {
  referrer: Referrer;
  busy: boolean;
  error: unknown;
  onCancel: () => void;
  onSubmit: (payload: CreateReferralPaymentInput) => void;
}) {
  const [amountMajor, setAmountMajor] = useState('');
  const [whenLocal, setWhenLocal] = useState(() => toLocalInput(new Date()));
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [note, setNote] = useState('');
  const [formErr, setFormErr] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = createReferralPaymentSchema.safeParse({
      referrerId: referrer.id,
      amountMinor: toMinor(num(amountMajor)),
      paidAt: localInputToIso(whenLocal) || undefined,
      periodFrom: periodFrom || undefined,
      periodTo: periodTo || undefined,
      note: blankToUndefined(note),
    });
    if (!parsed.success) {
      setFormErr(zodMessage(parsed.error));
      return;
    }
    setFormErr(null);
    onSubmit(parsed.data);
  }

  return (
    <div className="card">
      <div className="section">
        <h2>Record payment — {referrer.name}</h2>
        {formErr && (
          <div className="alert" role="alert">
            {formErr}
          </div>
        )}
        <ErrorNote error={error} fallback="Could not record the payment" />
        <form onSubmit={submit} noValidate>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="pay-amount">Amount (PKR)</label>
              <input
                id="pay-amount"
                type="number"
                min="0"
                step="0.01"
                value={amountMajor}
                onChange={(e) => setAmountMajor(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="pay-when">Paid</label>
              <input
                id="pay-when"
                type="datetime-local"
                value={whenLocal}
                onChange={(e) => setWhenLocal(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="pay-from">
                Period from <span className="muted">(optional)</span>
              </label>
              <input
                id="pay-from"
                type="date"
                value={periodFrom}
                max={periodTo || undefined}
                onChange={(e) => setPeriodFrom(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="pay-to">
                Period to <span className="muted">(optional)</span>
              </label>
              <input
                id="pay-to"
                type="date"
                value={periodTo}
                min={periodFrom || undefined}
                onChange={(e) => setPeriodTo(e.target.value)}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="pay-note">
              Note <span className="muted">(optional)</span>
            </label>
            <textarea
              id="pay-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          <div className="row">
            <button type="submit" disabled={busy}>
              {busy ? 'Recording…' : 'Record payment'}
            </button>
            <button type="button" className="secondary" onClick={onCancel}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
