import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createExpenseSchema,
  createIncomeSchema,
  createLedgerHeadSchema,
  formatMoney,
  toMinor,
  type CreateExpenseInput,
  type CreateIncomeInput,
  type LedgerEntry,
  type LedgerHead,
  updateLedgerHeadSchema,
  type UpdateLedgerHeadInput,
  type LedgerSummary,
} from '@hms/shared';
import { api } from '../lib/api';
import { useCan } from '../lib/permissions';
import { num } from '../lib/bill-line';
import {
  blankToUndefined,
  formatDateTime,
  localInputToIso,
  toLocalInput,
  todayIsoDate,
} from '../lib/format';
import { ErrorNote, Loading } from '../components/QueryFeedback';
import { Tabs, type TabDef } from '../components/Tabs';
import { useDebounced } from '../lib/useDebounced';

type TabValue = 'overview' | 'income' | 'expenses' | 'heads';
type LedgerKind = 'income' | 'expenses';

const TABS: readonly TabDef<TabValue>[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'income', label: 'Income' },
  { value: 'expenses', label: 'Expenses' },
  { value: 'heads', label: 'Heads' },
];

const inlineLabel = {
  display: 'inline-flex',
  gap: 6,
  alignItems: 'center',
  whiteSpace: 'nowrap',
} as const;

/** First day of the current month as YYYY-MM-DD, local time. */
function monthStartIso(): string {
  return `${todayIsoDate().slice(0, 8)}01`;
}

function zodMessage(error: {
  issues: { message: string; path: (string | number)[] }[];
}): string {
  const first = error.issues[0];
  if (!first) return 'Check the values';
  return first.path.length ? `${first.path.join('.')}: ${first.message}` : first.message;
}

/** A part's share of a whole, as a rounded percent string. */
function sharePct(part: number, whole: number): string {
  if (whole <= 0) return '—';
  return `${((part / whole) * 100).toFixed(1)}%`;
}

export function FinancePage() {
  const [tab, setTab] = useState<TabValue>('overview');

  return (
    <>
      <div className="page-head">
        <h1>Finance</h1>
      </div>
      <Tabs tabs={TABS} value={tab} onChange={setTab} ariaLabel="Finance views" />
      {tab === 'overview' && <OverviewTab />}
      {tab === 'income' && <LedgerTab kind="income" />}
      {tab === 'expenses' && <LedgerTab kind="expenses" />}
      {tab === 'heads' && <HeadsTab />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Overview
// ---------------------------------------------------------------------------

function OverviewTab() {
  const [from, setFrom] = useState(monthStartIso);
  const [to, setTo] = useState(todayIsoDate);

  const summary = useQuery({
    // LedgerSummary for a period.
    queryKey: ['finance', 'summary', from || null, to || null],
    queryFn: async () => {
      const { data } = await api.get<LedgerSummary>('/finance/summary', {
        params: { from: from || undefined, to: to || undefined },
      });
      return data;
    },
  });

  const s = summary.data;
  const net = s?.netMinor ?? 0;
  const netWord = net < 0 ? 'Loss' : net > 0 ? 'Profit' : 'Break-even';

  return (
    <div className="card">
      <div className="section">
        <h2>Position</h2>
        <div className="toolbar" style={{ flexWrap: 'wrap' }}>
          <label style={inlineLabel}>
            From
            <input
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
              aria-label="From date"
            />
          </label>
          <label style={inlineLabel}>
            To
            <input
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
              aria-label="To date"
            />
          </label>
        </div>

        <ErrorNote error={summary.error} fallback="Could not load the summary" />
        {summary.isPending && <Loading label="Loading summary…" />}

        {s && (
          <>
            <div className="board-totals" style={{ marginTop: 4 }}>
              <div className="board-total">
                <span className="n">{formatMoney(s.incomeMinor)}</span>
                <span className="k">Income</span>
              </div>
              <div className="board-total">
                <span className="n">{formatMoney(s.expenseMinor)}</span>
                <span className="k">Expenses</span>
              </div>
              <div className="board-total">
                <span className="n">
                  {net < 0 ? `−${formatMoney(Math.abs(net))}` : formatMoney(net)}
                </span>
                <span className="k">Net &middot; {netWord}</span>
              </div>
            </div>

            <p
              className={net < 0 ? 'banner-danger' : 'muted'}
              style={net < 0 ? undefined : { marginTop: 0 }}
            >
              {net < 0
                ? `This period is a net LOSS of ${formatMoney(
                    Math.abs(net),
                  )} — expenses exceed income.`
                : net > 0
                  ? `This period is a net profit of ${formatMoney(net)}.`
                  : 'Income and expenses are exactly equal this period.'}
            </p>

            <div className="form-grid" style={{ marginTop: 8 }}>
              <HeadBreakdown
                title="Income by head"
                rows={s.byIncomeHead}
                total={s.incomeMinor}
              />
              <HeadBreakdown
                title="Expenses by head"
                rows={s.byExpenseHead}
                total={s.expenseMinor}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function HeadBreakdown({
  title,
  rows,
  total,
}: {
  title: string;
  rows: readonly { headId: string; name: string; amountMinor: number }[];
  total: number;
}) {
  return (
    <div>
      <h3
        style={{
          fontSize: 13,
          color: 'var(--muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.03em',
          margin: '0 0 8px',
        }}
      >
        {title}
      </h3>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Head</th>
              <th className="num">Amount</th>
              <th className="num">Share</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.headId}>
                <td>{r.name}</td>
                <td className="num">{formatMoney(r.amountMinor)}</td>
                <td className="num">{sharePct(r.amountMinor, total)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={3} className="muted">
                  Nothing recorded in this period.
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr>
                <td className="num">
                  <strong>Total</strong>
                </td>
                <td className="num">
                  <strong>{formatMoney(total)}</strong>
                </td>
                <td className="num">
                  <strong>100%</strong>
                </td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Income / Expenses ledger
// ---------------------------------------------------------------------------

function LedgerTab({ kind }: { kind: LedgerKind }) {
  const can = useCan();
  const canManage = can('finance:manage');
  const queryClient = useQueryClient();
  const headsPath = kind === 'income' ? 'income-heads' : 'expense-heads';
  const noun = kind === 'income' ? 'income entry' : 'expense';

  const [headId, setHeadId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [qRaw, setQRaw] = useState('');
  const q = useDebounced(qRaw);

  const heads = useQuery({
    // LedgerHead[] — the income or expense head list.
    queryKey: ['finance', headsPath, 'list'],
    queryFn: async () => {
      const { data } = await api.get<LedgerHead[]>(`/finance/${headsPath}`);
      return data;
    },
  });

  const entries = useQuery({
    // LedgerEntry[] — filters vary the contents.
    queryKey: [
      'finance',
      kind,
      'list',
      headId || null,
      from || null,
      to || null,
      q || null,
    ],
    queryFn: async () => {
      const { data } = await api.get<LedgerEntry[]>(`/finance/${kind}`, {
        params: {
          headId: headId || undefined,
          from: from || undefined,
          to: to || undefined,
          q: q || undefined,
        },
      });
      return data;
    },
  });

  const rows = entries.data ?? [];
  const totalMinor = rows.reduce((sum, e) => sum + e.amountMinor, 0);

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['finance'] });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/finance/${kind}/${id}`);
    },
    onSuccess: invalidate,
  });

  // --- add form --------------------------------------------------------
  const [formHeadId, setFormHeadId] = useState('');
  const [description, setDescription] = useState('');
  const [amountMajor, setAmountMajor] = useState('');
  const [whenLocal, setWhenLocal] = useState(() => toLocalInput(new Date()));
  const [invoiceNo, setInvoiceNo] = useState('');
  const [note, setNote] = useState('');
  const [formErr, setFormErr] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async (payload: CreateIncomeInput | CreateExpenseInput) => {
      const { data } = await api.post<LedgerEntry>(`/finance/${kind}`, payload);
      return data;
    },
    onSuccess: async () => {
      setDescription('');
      setAmountMajor('');
      setInvoiceNo('');
      setNote('');
      setWhenLocal(toLocalInput(new Date()));
      setFormErr(null);
      await invalidate();
    },
  });

  function onCreate(event: FormEvent) {
    event.preventDefault();
    const iso = localInputToIso(whenLocal);
    const base = {
      headId: formHeadId,
      description: description.trim(),
      amountMinor: toMinor(num(amountMajor)),
      invoiceNo: blankToUndefined(invoiceNo),
      note: blankToUndefined(note),
    };
    const parsed =
      kind === 'income'
        ? createIncomeSchema.safeParse({ ...base, receivedAt: iso || undefined })
        : createExpenseSchema.safeParse({ ...base, paidAt: iso || undefined });
    if (!parsed.success) {
      setFormErr(zodMessage(parsed.error));
      return;
    }
    setFormErr(null);
    create.mutate(parsed.data);
  }

  const headOptions = heads.data ?? [];
  const activeHeadOptions = headOptions.filter((h) => h.isActive);

  return (
    <>
      <div className="card">
        <div className="section">
          <h2>{kind === 'income' ? 'Income' : 'Expenses'}</h2>
          <div className="toolbar" style={{ flexWrap: 'wrap' }}>
            <input
              placeholder="Search description or invoice"
              value={qRaw}
              onChange={(e) => setQRaw(e.target.value)}
              aria-label="Search entries"
            />
            <select
              value={headId}
              onChange={(e) => setHeadId(e.target.value)}
              aria-label="Filter by head"
              style={{ maxWidth: 220 }}
            >
              <option value="">All heads</option>
              {headOptions.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                  {h.isActive ? '' : ' (inactive)'}
                </option>
              ))}
            </select>
            <label style={inlineLabel}>
              From
              <input
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => setFrom(e.target.value)}
                aria-label="From date"
              />
            </label>
            <label style={inlineLabel}>
              To
              <input
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
                aria-label="To date"
              />
            </label>
          </div>

          <ErrorNote error={entries.error} fallback="Could not load entries" />
          <ErrorNote error={remove.error} fallback="Could not delete the entry" />
          {entries.isPending && <Loading label="Loading entries…" />}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Head</th>
                  <th>Description</th>
                  <th>Invoice no</th>
                  <th className="num">Amount</th>
                  {canManage && <th className="no-print" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((e) => (
                  <tr key={e.id}>
                    <td>{formatDateTime(e.occurredAt)}</td>
                    <td>{e.head.name}</td>
                    <td>
                      {e.description}
                      {e.note ? <div className="muted">{e.note}</div> : null}
                    </td>
                    <td>{e.invoiceNo ?? <span className="muted">—</span>}</td>
                    <td className="num">{formatMoney(e.amountMinor)}</td>
                    {canManage && (
                      <td className="no-print">
                        <button
                          type="button"
                          className="danger"
                          disabled={remove.isPending}
                          onClick={() => remove.mutate(e.id)}
                        >
                          Delete
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {entries.data && rows.length === 0 && (
                  <tr>
                    <td colSpan={canManage ? 6 : 5} className="muted">
                      No entries match.
                    </td>
                  </tr>
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot>
                  <tr>
                    <td colSpan={4} className="num">
                      <strong>Total</strong>
                    </td>
                    <td className="num">
                      <strong>{formatMoney(totalMinor)}</strong>
                    </td>
                    {canManage && <td className="no-print" />}
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      </div>

      {canManage && (
        <div className="card">
          <div className="section">
            <h2>Add {noun}</h2>
            {formErr && (
              <div className="alert" role="alert">
                {formErr}
              </div>
            )}
            <ErrorNote error={create.error} fallback={`Could not save the ${noun}`} />
            <form onSubmit={onCreate} noValidate>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="fin-head">Head</label>
                  <select
                    id="fin-head"
                    value={formHeadId}
                    onChange={(e) => setFormHeadId(e.target.value)}
                  >
                    <option value="">—</option>
                    {activeHeadOptions.map((h) => (
                      <option key={h.id} value={h.id}>
                        {h.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="fin-amount">Amount (PKR)</label>
                  <input
                    id="fin-amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={amountMajor}
                    onChange={(e) => setAmountMajor(e.target.value)}
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="fin-desc">Description</label>
                <input
                  id="fin-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="fin-when">Date</label>
                  <input
                    id="fin-when"
                    type="datetime-local"
                    value={whenLocal}
                    onChange={(e) => setWhenLocal(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="fin-invoice">
                    Invoice no <span className="muted">(optional)</span>
                  </label>
                  <input
                    id="fin-invoice"
                    value={invoiceNo}
                    onChange={(e) => setInvoiceNo(e.target.value)}
                  />
                </div>
              </div>
              <div className="field">
                <label htmlFor="fin-note">
                  Note <span className="muted">(optional)</span>
                </label>
                <textarea
                  id="fin-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
              </div>
              <button type="submit" disabled={create.isPending}>
                {create.isPending ? 'Saving…' : `Add ${noun}`}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Heads
// ---------------------------------------------------------------------------

function HeadsTab() {
  const can = useCan();
  const canManage = can('finance:manage');

  return (
    <div className="form-grid">
      <HeadColumn title="Income heads" path="income-heads" canManage={canManage} />
      <HeadColumn title="Expense heads" path="expense-heads" canManage={canManage} />
    </div>
  );
}

function HeadColumn({
  title,
  path,
  canManage,
}: {
  title: string;
  path: 'income-heads' | 'expense-heads';
  canManage: boolean;
}) {
  const queryClient = useQueryClient();

  const list = useQuery({
    // LedgerHead[] for the head editor.
    queryKey: ['finance', path, 'list'],
    queryFn: async () => {
      const { data } = await api.get<LedgerHead[]>(`/finance/${path}`);
      return data;
    },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['finance', path] });

  const [name, setName] = useState('');
  const [formErr, setFormErr] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async (payload: { name: string }) => {
      const { data } = await api.post<LedgerHead>(`/finance/${path}`, payload);
      return data;
    },
    onSuccess: async () => {
      setName('');
      setFormErr(null);
      await invalidate();
    },
  });

  const update = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: UpdateLedgerHeadInput;
    }) => {
      // Validated here as well as on the server, so a bad rename fails at the
      // keyboard rather than as a 400 from three layers away.
      const body = updateLedgerHeadSchema.parse(patch);
      const { data } = await api.patch<LedgerHead>(`/finance/${path}/${id}`, body);
      return data;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/finance/${path}/${id}`);
    },
    onSuccess: invalidate,
  });

  function onCreate(event: FormEvent) {
    event.preventDefault();
    const parsed = createLedgerHeadSchema.safeParse({ name: name.trim() });
    if (!parsed.success) {
      setFormErr(zodMessage(parsed.error));
      return;
    }
    setFormErr(null);
    create.mutate(parsed.data);
  }

  const rows = list.data ?? [];
  const busy = update.isPending || remove.isPending;

  return (
    <div className="card">
      <div className="section">
        <h2>{title}</h2>
        <ErrorNote error={list.error} fallback="Could not load heads" />
        {list.isPending && <Loading />}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Active</th>
                {canManage && <th className="no-print" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => (
                <HeadRow
                  key={h.id}
                  head={h}
                  canManage={canManage}
                  busy={busy}
                  onRename={(nm) => update.mutate({ id: h.id, patch: { name: nm } })}
                  onToggle={() =>
                    update.mutate({ id: h.id, patch: { isActive: !h.isActive } })
                  }
                  onDelete={() => remove.mutate(h.id)}
                />
              ))}
              {list.data && rows.length === 0 && (
                <tr>
                  <td colSpan={canManage ? 3 : 2} className="muted">
                    None defined.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <ErrorNote error={update.error} fallback="Could not update the head" />
        <ErrorNote error={remove.error} fallback="Could not delete the head" />

        {canManage && (
          <>
            {formErr && (
              <div className="alert" role="alert">
                {formErr}
              </div>
            )}
            <ErrorNote error={create.error} fallback="Could not create the head" />
            <form onSubmit={onCreate} className="row" style={{ marginTop: 12 }}>
              <input
                placeholder="New head name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                aria-label={`New ${title}`}
              />
              <button type="submit" disabled={create.isPending || !name.trim()}>
                Add
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

function HeadRow({
  head,
  canManage,
  busy,
  onRename,
  onToggle,
  onDelete,
}: {
  head: LedgerHead;
  canManage: boolean;
  busy: boolean;
  onRename: (name: string) => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(head.name);

  if (!editing) {
    return (
      <tr>
        <td>{head.name}</td>
        <td>{head.isActive ? 'Yes' : 'No'}</td>
        {canManage && (
          <td className="no-print">
            <div className="row">
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setName(head.name);
                  setEditing(true);
                }}
              >
                Rename
              </button>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={onToggle}
              >
                {head.isActive ? 'Deactivate' : 'Activate'}
              </button>
              <button
                type="button"
                className="danger"
                disabled={busy}
                onClick={onDelete}
              >
                Delete
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
          aria-label="Head name"
        />
      </td>
      <td>{head.isActive ? 'Yes' : 'No'}</td>
      <td className="no-print">
        <div className="row">
          <button
            type="button"
            disabled={busy || !name.trim()}
            onClick={() => {
              onRename(name.trim());
              setEditing(false);
            }}
          >
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
