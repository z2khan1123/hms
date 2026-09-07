import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createPurchaseSchema,
  formatMoney,
  toMinor,
  type Medicine,
  type MedicineBatch,
  type Purchase,
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
  todayIsoDate,
} from '../lib/format';
import { ErrorNote, Loading } from '../components/QueryFeedback';
import { MedicinePicker } from '../components/MedicinePicker';
import { Tabs, type TabDef } from '../components/Tabs';
import { useDebounced } from '../lib/useDebounced';

type TabValue = 'batches' | 'purchases';

const TABS: readonly TabDef<TabValue>[] = [
  { value: 'batches', label: 'Batches' },
  { value: 'purchases', label: 'Purchases' },
];

export function StockPage() {
  const [tab, setTab] = useState<TabValue>('batches');

  return (
    <>
      <div className="page-head">
        <h1>Stock</h1>
      </div>
      <Tabs tabs={TABS} value={tab} onChange={setTab} ariaLabel="Stock views" />
      {tab === 'batches' ? <BatchesTab /> : <PurchasesTab />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Batches
// ---------------------------------------------------------------------------

function BatchesTab() {
  const [medicine, setMedicine] = useState<Medicine | null>(null);
  const [expiringInDaysRaw, setExpiringInDaysRaw] = useState('90');
  const [includeEmpty, setIncludeEmpty] = useState(false);
  const expiringInDays = useDebounced(expiringInDaysRaw);

  const days = expiringInDays.trim() ? Number(expiringInDays) : undefined;

  const batches = useQuery({
    // MedicineBatch[] — filters vary the contents.
    queryKey: [
      'pharmacy',
      'batches',
      'list',
      medicine?.id ?? null,
      Number.isFinite(days) ? days : null,
      includeEmpty,
    ],
    queryFn: async () => {
      const { data } = await api.get<MedicineBatch[]>('/pharmacy/batches', {
        params: {
          medicineId: medicine?.id || undefined,
          expiringInDays: Number.isFinite(days) ? days : undefined,
          includeEmpty: includeEmpty || undefined,
        },
      });
      return data;
    },
  });

  const rows = batches.data ?? [];

  return (
    <div className="card">
      <div className="section">
        <h2>Batches</h2>
        <p className="muted">
          Stock arrives in batches, each with its own expiry and sale price. An{' '}
          <strong>Expired</strong> batch is marked as such and can never be
          dispensed.
        </p>

        <div className="toolbar" style={{ flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            {medicine ? (
              <div className="picked">
                <span className="picked-title">{medicine.name}</span>
                <button
                  type="button"
                  className="secondary"
                  onClick={() => setMedicine(null)}
                >
                  Clear
                </button>
              </div>
            ) : (
              <MedicinePicker
                label={undefined}
                placeholder="Filter by medicine (optional)"
                includeInactive
                onSelect={setMedicine}
              />
            )}
          </div>
          <label
            style={{
              display: 'inline-flex',
              gap: 6,
              alignItems: 'center',
              whiteSpace: 'nowrap',
            }}
          >
            Expiring within
            <input
              type="number"
              min="0"
              step="1"
              value={expiringInDaysRaw}
              onChange={(e) => setExpiringInDaysRaw(e.target.value)}
              aria-label="Expiring within days"
              style={{ width: 80 }}
            />
            days
          </label>
          <label
            style={{
              display: 'inline-flex',
              gap: 6,
              alignItems: 'center',
              whiteSpace: 'nowrap',
            }}
          >
            <input
              type="checkbox"
              checked={includeEmpty}
              onChange={(e) => setIncludeEmpty(e.target.checked)}
            />
            Show empty batches
          </label>
        </div>

        <ErrorNote error={batches.error} fallback="Could not load batches" />
        {batches.isPending && <Loading label="Loading batches…" />}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Medicine</th>
                <th>Batch</th>
                <th>Expiry</th>
                <th className="num">Quantity</th>
                <th className="num">Sale price</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b) => (
                <tr key={b.id} className={b.isExpired ? 'row-expired' : undefined}>
                  <td>{b.medicineName}</td>
                  <td>{b.batchNo}</td>
                  <td>
                    {formatDate(b.expiryDate)}{' '}
                    {b.isExpired ? (
                      <span className="stock-tag stock-expired">Expired</span>
                    ) : null}
                  </td>
                  <td className="num">{b.quantity}</td>
                  <td className="num">
                    {b.salePriceMinor != null ? (
                      formatMoney(b.salePriceMinor)
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
              {batches.data && rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    No batches match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Purchases
// ---------------------------------------------------------------------------

interface PurchaseLine {
  key: string;
  medicineId: string;
  medicineName: string;
  batchNo: string;
  expiryDate: string;
  quantity: string;
  purchasePriceMajor: string;
  salePriceMajor: string;
}

function emptyLine(): PurchaseLine {
  return {
    key: `l-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    medicineId: '',
    medicineName: '',
    batchNo: '',
    expiryDate: '',
    quantity: '1',
    purchasePriceMajor: '',
    salePriceMajor: '',
  };
}

function PurchasesTab() {
  const can = useCan();
  const canManage = can('stock:manage');
  const queryClient = useQueryClient();

  const purchases = useQuery({
    // Purchase[] — the recorded purchase history.
    queryKey: ['pharmacy', 'purchases', 'list'],
    queryFn: async () => {
      const { data } = await api.get<Purchase[]>('/pharmacy/purchases');
      return data;
    },
  });

  const [expandedId, setExpandedId] = useState<string | null>(null);

  // --- record purchase form -------------------------------------------
  const [supplierName, setSupplierName] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [purchasedAtLocal, setPurchasedAtLocal] = useState(() =>
    toLocalInput(new Date()),
  );
  const [note, setNote] = useState('');
  const [lines, setLines] = useState<PurchaseLine[]>([emptyLine()]);
  const [issue, setIssue] = useState<string | null>(null);

  const setLine = (key: string, patch: Partial<PurchaseLine>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const runningTotalMinor = useMemo(
    () =>
      lines.reduce(
        (sum, l) =>
          sum +
          Math.max(0, Math.trunc(num(l.quantity))) *
            Math.max(0, toMinor(num(l.purchasePriceMajor))),
        0,
      ),
    [lines],
  );

  function resetForm() {
    setSupplierName('');
    setInvoiceNo('');
    setPurchasedAtLocal(toLocalInput(new Date()));
    setNote('');
    setLines([emptyLine()]);
    setIssue(null);
  }

  const record = useMutation({
    mutationFn: async () => {
      const items = lines
        .filter((l) => l.medicineId && l.batchNo.trim() && l.expiryDate)
        .map((l) => ({
          medicineId: l.medicineId,
          batchNo: l.batchNo.trim(),
          expiryDate: l.expiryDate,
          quantity: Math.trunc(num(l.quantity)),
          purchasePriceMinor: Math.max(0, toMinor(num(l.purchasePriceMajor))),
          salePriceMinor: l.salePriceMajor.trim()
            ? Math.max(0, toMinor(num(l.salePriceMajor)))
            : undefined,
        }));
      const iso = localInputToIso(purchasedAtLocal);
      const parsed = createPurchaseSchema.safeParse({
        supplierName: supplierName.trim(),
        invoiceNo: blankToUndefined(invoiceNo),
        purchasedAt: iso || undefined,
        note: blankToUndefined(note),
        items,
      });
      if (!parsed.success) {
        throw new Error(
          parsed.error.issues[0]?.message ??
            'Add at least one line with a medicine, batch number and expiry.',
        );
      }
      const { data } = await api.post<Purchase>(
        '/pharmacy/purchases',
        parsed.data,
      );
      return data;
    },
    onSuccess: async () => {
      resetForm();
      await queryClient.invalidateQueries({ queryKey: ['pharmacy', 'purchases'] });
      await queryClient.invalidateQueries({ queryKey: ['pharmacy', 'batches'] });
      await queryClient.invalidateQueries({ queryKey: ['pharmacy', 'medicines'] });
    },
    onError: (err) =>
      setIssue(err instanceof Error ? err.message : 'Could not record the purchase'),
  });

  const list = purchases.data ?? [];

  return (
    <>
      <div className="card">
        <div className="section">
          <h2>Recorded purchases</h2>
          <ErrorNote error={purchases.error} fallback="Could not load purchases" />
          {purchases.isPending && <Loading label="Loading purchases…" />}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Supplier</th>
                  <th>Invoice</th>
                  <th>Date</th>
                  <th className="num">Lines</th>
                  <th className="num">Total</th>
                  <th className="no-print" />
                </tr>
              </thead>
              <tbody>
                {list.map((p) => (
                  <PurchaseRow
                    key={p.id}
                    purchase={p}
                    expanded={expandedId === p.id}
                    onToggle={() =>
                      setExpandedId((cur) => (cur === p.id ? null : p.id))
                    }
                  />
                ))}
                {purchases.data && list.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted">
                      No purchases recorded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {canManage && (
        <div className="card">
          <div className="section">
            <h2>Record purchase</h2>
            {issue && (
              <div className="alert" role="alert">
                {issue}
              </div>
            )}
            <ErrorNote error={record.error} fallback="Could not record the purchase" />

            <div className="form-grid">
              <div className="field">
                <label htmlFor="pur-supplier">Supplier</label>
                <input
                  id="pur-supplier"
                  value={supplierName}
                  onChange={(e) => setSupplierName(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="pur-invoice">
                  Invoice number <span className="muted">(optional)</span>
                </label>
                <input
                  id="pur-invoice"
                  value={invoiceNo}
                  onChange={(e) => setInvoiceNo(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="pur-date">Purchase date</label>
                <input
                  id="pur-date"
                  type="datetime-local"
                  value={purchasedAtLocal}
                  onChange={(e) => setPurchasedAtLocal(e.target.value)}
                />
              </div>
            </div>
            <div className="field">
              <label htmlFor="pur-note">
                Note <span className="muted">(optional)</span>
              </label>
              <textarea
                id="pur-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            <div className="table-wrap" style={{ marginTop: 8 }}>
              <table>
                <thead>
                  <tr>
                    <th style={{ minWidth: 220 }}>Medicine</th>
                    <th>Batch no</th>
                    <th>Expiry</th>
                    <th className="num">Qty</th>
                    <th className="num">Purchase price</th>
                    <th className="num">Sale price</th>
                    <th className="num">Line total</th>
                    <th className="no-print" />
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => {
                    const lineTotal =
                      Math.max(0, Math.trunc(num(l.quantity))) *
                      Math.max(0, toMinor(num(l.purchasePriceMajor)));
                    return (
                      <tr key={l.key}>
                        <td>
                          {l.medicineId ? (
                            <div className="picked">
                              <span className="picked-title">
                                {l.medicineName}
                              </span>
                              <button
                                type="button"
                                className="secondary"
                                onClick={() =>
                                  setLine(l.key, {
                                    medicineId: '',
                                    medicineName: '',
                                  })
                                }
                              >
                                Clear
                              </button>
                            </div>
                          ) : (
                            <MedicinePicker
                              label={undefined}
                              placeholder="Search medicine"
                              includeInactive
                              onSelect={(m) =>
                                setLine(l.key, {
                                  medicineId: m.id,
                                  medicineName: m.name,
                                })
                              }
                            />
                          )}
                        </td>
                        <td>
                          <input
                            aria-label={`Batch number line ${i + 1}`}
                            value={l.batchNo}
                            onChange={(e) =>
                              setLine(l.key, { batchNo: e.target.value })
                            }
                          />
                        </td>
                        <td>
                          <input
                            type="date"
                            min={todayIsoDate()}
                            aria-label={`Expiry date line ${i + 1}`}
                            value={l.expiryDate}
                            onChange={(e) =>
                              setLine(l.key, { expiryDate: e.target.value })
                            }
                          />
                        </td>
                        <td className="num">
                          <input
                            type="number"
                            min="1"
                            step="1"
                            aria-label={`Quantity line ${i + 1}`}
                            value={l.quantity}
                            onChange={(e) =>
                              setLine(l.key, { quantity: e.target.value })
                            }
                          />
                        </td>
                        <td className="num">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            aria-label={`Purchase price line ${i + 1}`}
                            value={l.purchasePriceMajor}
                            onChange={(e) =>
                              setLine(l.key, {
                                purchasePriceMajor: e.target.value,
                              })
                            }
                          />
                        </td>
                        <td className="num">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            aria-label={`Sale price line ${i + 1}`}
                            value={l.salePriceMajor}
                            onChange={(e) =>
                              setLine(l.key, { salePriceMajor: e.target.value })
                            }
                          />
                        </td>
                        <td className="num">{formatMoney(lineTotal)}</td>
                        <td className="no-print">
                          <button
                            type="button"
                            className="secondary"
                            disabled={lines.length === 1}
                            onClick={() =>
                              setLines((prev) =>
                                prev.filter((x) => x.key !== l.key),
                              )
                            }
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={6} className="num">
                      <strong>Running total</strong>
                    </td>
                    <td className="num">
                      <strong>{formatMoney(runningTotalMinor)}</strong>
                    </td>
                    <td className="no-print" />
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="row no-print" style={{ marginTop: 12 }}>
              <button
                type="button"
                className="secondary"
                onClick={() => setLines((prev) => [...prev, emptyLine()])}
              >
                Add line
              </button>
              <button
                type="button"
                disabled={record.isPending}
                onClick={() => record.mutate()}
              >
                {record.isPending ? 'Recording…' : 'Record purchase'}
              </button>
              {record.isSuccess && <span className="muted">Recorded.</span>}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function PurchaseRow({
  purchase,
  expanded,
  onToggle,
}: {
  purchase: Purchase;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <>
      <tr>
        <td>{purchase.supplierName}</td>
        <td>{purchase.invoiceNo ?? <span className="muted">—</span>}</td>
        <td>{formatDateTime(purchase.purchasedAt)}</td>
        <td className="num">{purchase.items.length}</td>
        <td className="num">{formatMoney(purchase.totalMinor)}</td>
        <td className="no-print">
          <button type="button" className="secondary" onClick={onToggle}>
            {expanded ? 'Hide' : 'View'}
          </button>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6}>
            {purchase.note ? (
              <p className="muted" style={{ marginTop: 0 }}>
                {purchase.note}
              </p>
            ) : null}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Medicine</th>
                    <th>Batch</th>
                    <th>Expiry</th>
                    <th className="num">Qty</th>
                    <th className="num">Purchase price</th>
                    <th className="num">Sale price</th>
                    <th className="num">Line total</th>
                  </tr>
                </thead>
                <tbody>
                  {purchase.items.map((it) => (
                    <tr key={it.id}>
                      <td>{it.medicineName}</td>
                      <td>{it.batchNo}</td>
                      <td>{formatDate(it.expiryDate)}</td>
                      <td className="num">{it.quantity}</td>
                      <td className="num">{formatMoney(it.purchasePriceMinor)}</td>
                      <td className="num">
                        {it.salePriceMinor != null ? (
                          formatMoney(it.salePriceMinor)
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td className="num">{formatMoney(it.lineTotalMinor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
