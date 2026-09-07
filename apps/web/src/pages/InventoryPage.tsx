import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  STOCK_MOVE_KIND_LABELS,
  adjustStockSchema,
  createInventoryItemSchema,
  createNamedSchema,
  issueStockSchema,
  receiveStockSchema,
  signedQuantity,
  stockMoveKindSchema,
  toMinor,
  type AdjustStockInput,
  type CreateInventoryItemInput,
  type InventoryItem,
  updateInventoryItemSchema,
  type UpdateInventoryItemInput,
  type IssueStockInput,
  type NamedRecord,
  type ReceiveStockInput,
  type StockMove,
  type StockMoveKind,
} from '@hms/shared';
import { api } from '../lib/api';
import { useCan } from '../lib/permissions';
import { num } from '../lib/bill-line';
import { blankToUndefined, formatDateTime } from '../lib/format';
import { ErrorNote, Loading } from '../components/QueryFeedback';
import { SearchSelect } from '../components/SearchSelect';
import { StatusBadge } from '../components/StatusBadge';
import { Tabs, type TabDef } from '../components/Tabs';
import { useDebounced } from '../lib/useDebounced';

type TabValue = 'items' | 'movements' | 'setup';

const TABS: readonly TabDef<TabValue>[] = [
  { value: 'items', label: 'Items' },
  { value: 'movements', label: 'Movements' },
  { value: 'setup', label: 'Setup' },
];

const KINDS = stockMoveKindSchema.options;

const inlineLabel = {
  display: 'inline-flex',
  gap: 6,
  alignItems: 'center',
  whiteSpace: 'nowrap',
} as const;

function zodMessage(error: {
  issues: { message: string; path: (string | number)[] }[];
}): string {
  const first = error.issues[0];
  if (!first) return 'Check the values';
  return first.path.length ? `${first.path.join('.')}: ${first.message}` : first.message;
}

export function InventoryPage() {
  const [tab, setTab] = useState<TabValue>('items');

  return (
    <>
      <div className="page-head">
        <h1>Inventory</h1>
      </div>
      <Tabs tabs={TABS} value={tab} onChange={setTab} ariaLabel="Inventory views" />
      {tab === 'items' && <ItemsTab />}
      {tab === 'movements' && <MovementsTab />}
      {tab === 'setup' && <SetupTab />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Shared: reference-data queries and an item type-ahead
// ---------------------------------------------------------------------------

function useCategories() {
  return useQuery({
    // NamedRecord[] — inventory categories.
    queryKey: ['inventory', 'categories', 'list'],
    queryFn: async () => {
      const { data } = await api.get<NamedRecord[]>('/inventory/categories');
      return data;
    },
  });
}

function useStores() {
  return useQuery({
    // NamedRecord[] — inventory stores.
    queryKey: ['inventory', 'stores', 'list'],
    queryFn: async () => {
      const { data } = await api.get<NamedRecord[]>('/inventory/stores');
      return data;
    },
  });
}

function ItemSearch({
  label,
  value,
  onSelect,
  placeholder,
}: {
  label?: string;
  value: InventoryItem | null;
  onSelect: (item: InventoryItem | null) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const debounced = useDebounced(query);

  const results = useQuery({
    // InventoryItem[] for a type-ahead — distinct from the Items tab filter key.
    queryKey: ['inventory', 'items', 'picker', debounced],
    queryFn: async () => {
      const { data } = await api.get<InventoryItem[]>('/inventory/items', {
        params: { q: debounced || undefined },
      });
      return data;
    },
  });

  if (value) {
    return (
      <div className="field">
        {label && <label>{label}</label>}
        <div className="picked">
          <span className="picked-title">{value.name}</span>
          <button
            type="button"
            className="secondary"
            onClick={() => onSelect(null)}
          >
            Clear
          </button>
        </div>
      </div>
    );
  }

  return (
    <SearchSelect
      label={label}
      placeholder={placeholder ?? 'Search items'}
      query={query}
      onQueryChange={setQuery}
      items={results.data ?? []}
      isLoading={results.isFetching}
      error={results.error}
      emptyLabel="No item matches"
      getKey={(i) => i.id}
      renderItem={(i) => (
        <>
          <div>{i.name}</div>
          <div className="muted">
            {i.unit ?? 'unit'} · on hand {i.quantityOnHand}
            {i.belowReorderLevel ? ' · Low' : ''}
          </div>
        </>
      )}
      onSelect={(i) => onSelect(i)}
    />
  );
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

function ItemsTab() {
  const can = useCan();
  const canManage = can('inventory:manage');
  const queryClient = useQueryClient();

  const categories = useCategories();
  const stores = useStores();

  const [qRaw, setQRaw] = useState('');
  const q = useDebounced(qRaw);
  const [categoryId, setCategoryId] = useState('');
  const [storeId, setStoreId] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);

  const items = useQuery({
    // InventoryItem[] — filters vary the contents.
    queryKey: [
      'inventory',
      'items',
      'list',
      q || null,
      categoryId || null,
      storeId || null,
      lowStockOnly,
      includeInactive,
    ],
    queryFn: async () => {
      const { data } = await api.get<InventoryItem[]>('/inventory/items', {
        params: {
          q: q || undefined,
          categoryId: categoryId || undefined,
          storeId: storeId || undefined,
          lowStockOnly: lowStockOnly || undefined,
          includeInactive: includeInactive || undefined,
        },
      });
      return data;
    },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['inventory', 'items'] });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/inventory/items/${id}`);
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: UpdateInventoryItemInput;
    }) => {
      const body = updateInventoryItemSchema.parse(patch);
      const { data } = await api.patch<InventoryItem>(
        `/inventory/items/${id}`,
        body,
      );
      return data;
    },
    onSuccess: invalidate,
  });

  // --- add form -------------------------------------------------------
  const [name, setName] = useState('');
  const [formCategoryId, setFormCategoryId] = useState('');
  const [unit, setUnit] = useState('');
  const [reorderLevel, setReorderLevel] = useState('');
  const [formErr, setFormErr] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async (payload: CreateInventoryItemInput) => {
      const { data } = await api.post<InventoryItem>('/inventory/items', payload);
      return data;
    },
    onSuccess: async () => {
      setName('');
      setFormCategoryId('');
      setUnit('');
      setReorderLevel('');
      setFormErr(null);
      await invalidate();
    },
  });

  function onCreate(event: FormEvent) {
    event.preventDefault();
    const parsed = createInventoryItemSchema.safeParse({
      name: name.trim(),
      categoryId: formCategoryId || undefined,
      unit: blankToUndefined(unit),
      reorderLevel: reorderLevel.trim()
        ? Math.trunc(num(reorderLevel))
        : undefined,
    });
    if (!parsed.success) {
      setFormErr(zodMessage(parsed.error));
      return;
    }
    setFormErr(null);
    create.mutate(parsed.data);
  }

  const rows = items.data ?? [];
  const rowBusy = update.isPending || remove.isPending;

  return (
    <>
      <div className="card">
        <div className="section">
          <h2>Items</h2>
          <div className="toolbar" style={{ flexWrap: 'wrap' }}>
            <input
              placeholder="Search items"
              value={qRaw}
              onChange={(e) => setQRaw(e.target.value)}
              aria-label="Search items"
            />
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              aria-label="Filter by category"
              style={{ maxWidth: 200 }}
            >
              <option value="">All categories</option>
              {(categories.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              aria-label="Filter by store"
              style={{ maxWidth: 200 }}
            >
              <option value="">All stores</option>
              {(stores.data ?? []).map((st) => (
                <option key={st.id} value={st.id}>
                  {st.name}
                </option>
              ))}
            </select>
            <label style={inlineLabel}>
              <input
                type="checkbox"
                checked={lowStockOnly}
                onChange={(e) => setLowStockOnly(e.target.checked)}
              />
              Low stock only
            </label>
            <label style={inlineLabel}>
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(e) => setIncludeInactive(e.target.checked)}
              />
              Include inactive
            </label>
          </div>

          <ErrorNote error={items.error} fallback="Could not load items" />
          <ErrorNote error={update.error} fallback="Could not update the item" />
          <ErrorNote error={remove.error} fallback="Could not delete the item" />
          {items.isPending && <Loading label="Loading items…" />}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Unit</th>
                  <th className="num">On hand</th>
                  <th className="num">Reorder level</th>
                  <th>Status</th>
                  <th>By store</th>
                  {canManage && <th className="no-print" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((it) => (
                  <ItemRow
                    key={it.id}
                    item={it}
                    categories={categories.data ?? []}
                    canManage={canManage}
                    busy={rowBusy}
                    onSave={(patch) => update.mutate({ id: it.id, patch })}
                    onToggle={() =>
                      update.mutate({
                        id: it.id,
                        patch: { isActive: !it.isActive },
                      })
                    }
                    onDelete={() => remove.mutate(it.id)}
                  />
                ))}
                {items.data && rows.length === 0 && (
                  <tr>
                    <td colSpan={canManage ? 8 : 7} className="muted">
                      No items match.
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
            <h2>Add item</h2>
            {formErr && (
              <div className="alert" role="alert">
                {formErr}
              </div>
            )}
            <ErrorNote error={create.error} fallback="Could not create the item" />
            <form onSubmit={onCreate} noValidate>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="itm-name">Name</label>
                  <input
                    id="itm-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="itm-cat">
                    Category <span className="muted">(optional)</span>
                  </label>
                  <select
                    id="itm-cat"
                    value={formCategoryId}
                    onChange={(e) => setFormCategoryId(e.target.value)}
                  >
                    <option value="">—</option>
                    {(categories.data ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="itm-unit">
                    Unit <span className="muted">(optional)</span>
                  </label>
                  <input
                    id="itm-unit"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    placeholder="box, pair, litre…"
                  />
                </div>
                <div className="field">
                  <label htmlFor="itm-reorder">
                    Reorder level <span className="muted">(optional)</span>
                  </label>
                  <input
                    id="itm-reorder"
                    type="number"
                    min="0"
                    step="1"
                    value={reorderLevel}
                    onChange={(e) => setReorderLevel(e.target.value)}
                  />
                </div>
              </div>
              <button type="submit" disabled={create.isPending}>
                {create.isPending ? 'Creating…' : 'Add item'}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function ItemRow({
  item,
  categories,
  canManage,
  busy,
  onSave,
  onToggle,
  onDelete,
}: {
  item: InventoryItem;
  categories: readonly NamedRecord[];
  canManage: boolean;
  busy: boolean;
  onSave: (patch: Record<string, unknown>) => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [categoryId, setCategoryId] = useState(item.category?.id ?? '');
  const [unit, setUnit] = useState(item.unit ?? '');
  const [reorderLevel, setReorderLevel] = useState(
    item.reorderLevel != null ? String(item.reorderLevel) : '',
  );
  const [err, setErr] = useState<string | null>(null);

  function startEditing() {
    setName(item.name);
    setCategoryId(item.category?.id ?? '');
    setUnit(item.unit ?? '');
    setReorderLevel(item.reorderLevel != null ? String(item.reorderLevel) : '');
    setErr(null);
    setEditing(true);
  }

  function save() {
    if (!name.trim()) {
      setErr('Name is required');
      return;
    }
    onSave({
      name: name.trim(),
      categoryId: categoryId || null,
      unit: blankToUndefined(unit) ?? null,
      reorderLevel: reorderLevel.trim() ? Math.trunc(num(reorderLevel)) : null,
    });
    setEditing(false);
  }

  const byStore =
    item.byStore.length > 0 ? (
      <ul className="chip-list">
        {item.byStore.map((b) => (
          <li key={b.storeId} className="chip">
            {b.storeName}: {b.quantity}
          </li>
        ))}
      </ul>
    ) : (
      <span className="muted">—</span>
    );

  const status = item.belowReorderLevel ? (
    <span className="stock-tag stock-low">Low</span>
  ) : (
    <span className="stock-tag stock-ok">OK</span>
  );

  if (!editing) {
    return (
      <tr className={item.belowReorderLevel ? 'row-low' : undefined}>
        <td>
          {item.name}
          {!item.isActive && <span className="muted"> (inactive)</span>}
        </td>
        <td>{item.category?.name ?? <span className="muted">—</span>}</td>
        <td>{item.unit ?? <span className="muted">—</span>}</td>
        <td className="num">{item.quantityOnHand}</td>
        <td className="num">
          {item.reorderLevel != null ? (
            item.reorderLevel
          ) : (
            <span className="muted">—</span>
          )}
        </td>
        <td>{status}</td>
        <td>{byStore}</td>
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
                {item.isActive ? 'Deactivate' : 'Activate'}
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
          aria-label="Item name"
        />
        {err && <div className="hint">{err}</div>}
      </td>
      <td>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          aria-label="Category"
        >
          <option value="">—</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </td>
      <td>
        <input
          value={unit}
          onChange={(e) => setUnit(e.target.value)}
          aria-label="Unit"
        />
      </td>
      <td className="num">{item.quantityOnHand}</td>
      <td className="num">
        <input
          type="number"
          min="0"
          step="1"
          value={reorderLevel}
          onChange={(e) => setReorderLevel(e.target.value)}
          aria-label="Reorder level"
        />
      </td>
      <td>{status}</td>
      <td>{byStore}</td>
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

// ---------------------------------------------------------------------------
// Movements
// ---------------------------------------------------------------------------

function MovementsTab() {
  const can = useCan();
  const canManage = can('inventory:manage');
  const queryClient = useQueryClient();
  const stores = useStores();

  const [filterItem, setFilterItem] = useState<InventoryItem | null>(null);
  const [storeId, setStoreId] = useState('');
  const [kind, setKind] = useState<'' | StockMoveKind>('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const moves = useQuery({
    // StockMove[] — the movement ledger; filters vary the contents.
    queryKey: [
      'inventory',
      'moves',
      'list',
      filterItem?.id ?? null,
      storeId || null,
      kind || null,
      from || null,
      to || null,
    ],
    queryFn: async () => {
      const { data } = await api.get<StockMove[]>('/inventory/moves', {
        params: {
          itemId: filterItem?.id || undefined,
          storeId: storeId || undefined,
          kind: kind || undefined,
          from: from || undefined,
          to: to || undefined,
        },
      });
      return data;
    },
  });

  const afterMove = async () => {
    await queryClient.invalidateQueries({ queryKey: ['inventory', 'moves'] });
    await queryClient.invalidateQueries({ queryKey: ['inventory', 'items'] });
  };

  const rows = moves.data ?? [];

  return (
    <>
      <div className="card">
        <div className="section">
          <h2>Movement ledger</h2>
          <div className="toolbar" style={{ flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <ItemSearch
                label="Item"
                value={filterItem}
                onSelect={setFilterItem}
                placeholder="Filter by item (optional)"
              />
            </div>
            <label style={inlineLabel}>
              Store
              <select
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                aria-label="Filter by store"
              >
                <option value="">All</option>
                {(stores.data ?? []).map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name}
                  </option>
                ))}
              </select>
            </label>
            <label style={inlineLabel}>
              Kind
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as '' | StockMoveKind)}
                aria-label="Filter by kind"
              >
                <option value="">All</option>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {STOCK_MOVE_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>
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

          <ErrorNote error={moves.error} fallback="Could not load movements" />
          {moves.isPending && <Loading label="Loading movements…" />}

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Kind</th>
                  <th>Item</th>
                  <th>Store</th>
                  <th className="num">Quantity</th>
                  <th>Supplier / issued to</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((m) => {
                  const signed = signedQuantity({
                    kind: m.kind,
                    quantity: m.quantity,
                  });
                  return (
                    <tr key={m.id}>
                      <td>{formatDateTime(m.movedAt)}</td>
                      <td>
                        <StatusBadge
                          status={m.kind}
                          label={STOCK_MOVE_KIND_LABELS[m.kind]}
                        />
                      </td>
                      <td>{m.itemName}</td>
                      <td>{m.storeName}</td>
                      <td className="num">{signed > 0 ? `+${signed}` : signed}</td>
                      <td>
                        {m.supplierName ??
                          m.issuedToName ?? <span className="muted">—</span>}
                      </td>
                      <td>{m.note ?? <span className="muted">—</span>}</td>
                    </tr>
                  );
                })}
                {moves.data && rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="muted">
                      No movements match.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {canManage && (
        <>
          <ReceiveForm stores={stores.data ?? []} onDone={afterMove} />
          <IssueForm stores={stores.data ?? []} onDone={afterMove} />
          <AdjustForm stores={stores.data ?? []} onDone={afterMove} />
        </>
      )}
    </>
  );
}

function StoreSelect({
  id,
  value,
  stores,
  onChange,
}: {
  id: string;
  value: string;
  stores: readonly NamedRecord[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="field">
      <label htmlFor={id}>Store</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {stores.map((st) => (
          <option key={st.id} value={st.id}>
            {st.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function ReceiveForm({
  stores,
  onDone,
}: {
  stores: readonly NamedRecord[];
  onDone: () => void | Promise<void>;
}) {
  const [item, setItem] = useState<InventoryItem | null>(null);
  const [storeId, setStoreId] = useState('');
  const [qty, setQty] = useState('');
  const [supplier, setSupplier] = useState('');
  const [costMajor, setCostMajor] = useState('');
  const [formErr, setFormErr] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: async (payload: ReceiveStockInput) => {
      await api.post('/inventory/moves/receive', payload);
    },
    onSuccess: async () => {
      setItem(null);
      setStoreId('');
      setQty('');
      setSupplier('');
      setCostMajor('');
      setFormErr(null);
      await onDone();
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = receiveStockSchema.safeParse({
      itemId: item?.id,
      storeId,
      quantity: Math.trunc(num(qty)),
      supplierName: blankToUndefined(supplier),
      unitCostMinor: costMajor.trim() ? toMinor(num(costMajor)) : undefined,
    });
    if (!parsed.success) {
      setFormErr(zodMessage(parsed.error));
      return;
    }
    setFormErr(null);
    mut.mutate(parsed.data);
  }

  return (
    <div className="card">
      <div className="section">
        <h2>Receive stock</h2>
        {formErr && (
          <div className="alert" role="alert">
            {formErr}
          </div>
        )}
        <ErrorNote error={mut.error} fallback="Could not record the receipt" />
        <form onSubmit={submit} noValidate>
          <div className="form-grid">
            <ItemSearch label="Item" value={item} onSelect={setItem} />
            <StoreSelect
              id="rcv-store"
              value={storeId}
              stores={stores}
              onChange={setStoreId}
            />
            <div className="field">
              <label htmlFor="rcv-qty">Quantity</label>
              <input
                id="rcv-qty"
                type="number"
                min="1"
                step="1"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="rcv-supplier">
                Supplier <span className="muted">(optional)</span>
              </label>
              <input
                id="rcv-supplier"
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="rcv-cost">
                Unit cost (PKR) <span className="muted">(optional)</span>
              </label>
              <input
                id="rcv-cost"
                type="number"
                min="0"
                step="0.01"
                value={costMajor}
                onChange={(e) => setCostMajor(e.target.value)}
              />
            </div>
          </div>
          <button type="submit" disabled={mut.isPending}>
            {mut.isPending ? 'Recording…' : 'Receive'}
          </button>
        </form>
      </div>
    </div>
  );
}

function IssueForm({
  stores,
  onDone,
}: {
  stores: readonly NamedRecord[];
  onDone: () => void | Promise<void>;
}) {
  const [item, setItem] = useState<InventoryItem | null>(null);
  const [storeId, setStoreId] = useState('');
  const [qty, setQty] = useState('');
  const [issuedTo, setIssuedTo] = useState('');
  const [formErr, setFormErr] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: async (payload: IssueStockInput) => {
      await api.post('/inventory/moves/issue', payload);
    },
    onSuccess: async () => {
      setItem(null);
      setStoreId('');
      setQty('');
      setIssuedTo('');
      setFormErr(null);
      await onDone();
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = issueStockSchema.safeParse({
      itemId: item?.id,
      storeId,
      quantity: Math.trunc(num(qty)),
      issuedToName: blankToUndefined(issuedTo),
    });
    if (!parsed.success) {
      setFormErr(zodMessage(parsed.error));
      return;
    }
    setFormErr(null);
    mut.mutate(parsed.data);
  }

  return (
    <div className="card">
      <div className="section">
        <h2>Issue stock</h2>
        {formErr && (
          <div className="alert" role="alert">
            {formErr}
          </div>
        )}
        {/* The API returns 409 with the shortfall spelled out when an issue
            exceeds stock on hand; ErrorNote surfaces that message verbatim. */}
        <ErrorNote error={mut.error} fallback="Could not issue the stock" />
        <form onSubmit={submit} noValidate>
          <div className="form-grid">
            <ItemSearch label="Item" value={item} onSelect={setItem} />
            <StoreSelect
              id="iss-store"
              value={storeId}
              stores={stores}
              onChange={setStoreId}
            />
            <div className="field">
              <label htmlFor="iss-qty">Quantity</label>
              <input
                id="iss-qty"
                type="number"
                min="1"
                step="1"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="iss-to">
                Issued to <span className="muted">(optional)</span>
              </label>
              <input
                id="iss-to"
                value={issuedTo}
                onChange={(e) => setIssuedTo(e.target.value)}
                placeholder="Ward, staff member…"
              />
            </div>
          </div>
          <button type="submit" disabled={mut.isPending}>
            {mut.isPending ? 'Issuing…' : 'Issue'}
          </button>
        </form>
      </div>
    </div>
  );
}

function AdjustForm({
  stores,
  onDone,
}: {
  stores: readonly NamedRecord[];
  onDone: () => void | Promise<void>;
}) {
  const [item, setItem] = useState<InventoryItem | null>(null);
  const [storeId, setStoreId] = useState('');
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [formErr, setFormErr] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: async (payload: AdjustStockInput) => {
      await api.post('/inventory/moves/adjust', payload);
    },
    onSuccess: async () => {
      setItem(null);
      setStoreId('');
      setQty('');
      setReason('');
      setFormErr(null);
      await onDone();
    },
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = adjustStockSchema.safeParse({
      itemId: item?.id,
      storeId,
      quantity: Math.trunc(num(qty)),
      note: reason.trim(),
    });
    if (!parsed.success) {
      setFormErr(zodMessage(parsed.error));
      return;
    }
    setFormErr(null);
    mut.mutate(parsed.data);
  }

  return (
    <div className="card">
      <div className="section">
        <h2>Adjust stock</h2>
        <p className="muted">
          A signed correction — negative to write off, positive to add back. A
          reason is mandatory.
        </p>
        {formErr && (
          <div className="alert" role="alert">
            {formErr}
          </div>
        )}
        <ErrorNote error={mut.error} fallback="Could not record the adjustment" />
        <form onSubmit={submit} noValidate>
          <div className="form-grid">
            <ItemSearch label="Item" value={item} onSelect={setItem} />
            <StoreSelect
              id="adj-store"
              value={storeId}
              stores={stores}
              onChange={setStoreId}
            />
            <div className="field">
              <label htmlFor="adj-qty">Signed quantity</label>
              <input
                id="adj-qty"
                type="number"
                step="1"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="e.g. -3 or 5"
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="adj-reason">Reason</label>
            <textarea
              id="adj-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Breakage, stock count, expiry write-off…"
            />
          </div>
          <button type="submit" disabled={mut.isPending}>
            {mut.isPending ? 'Recording…' : 'Adjust'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function SetupTab() {
  const can = useCan();
  const canManage = can('inventory:manage');

  return (
    <div className="form-grid">
      <NamedColumn title="Categories" path="categories" canManage={canManage} />
      <NamedColumn title="Stores" path="stores" canManage={canManage} />
    </div>
  );
}

function NamedColumn({
  title,
  path,
  canManage,
}: {
  title: string;
  path: 'categories' | 'stores';
  canManage: boolean;
}) {
  const queryClient = useQueryClient();

  const list = useQuery({
    // NamedRecord[] for the setup editor.
    queryKey: ['inventory', path, 'list'],
    queryFn: async () => {
      const { data } = await api.get<NamedRecord[]>(`/inventory/${path}`);
      return data;
    },
  });

  const [name, setName] = useState('');
  const [formErr, setFormErr] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async (payload: { name: string }) => {
      const { data } = await api.post<NamedRecord>(`/inventory/${path}`, payload);
      return data;
    },
    onSuccess: async () => {
      setName('');
      setFormErr(null);
      await queryClient.invalidateQueries({ queryKey: ['inventory', path] });
    },
  });

  function onCreate(event: FormEvent) {
    event.preventDefault();
    const parsed = createNamedSchema.safeParse({ name: name.trim() });
    if (!parsed.success) {
      setFormErr(zodMessage(parsed.error));
      return;
    }
    setFormErr(null);
    create.mutate(parsed.data);
  }

  const rows = list.data ?? [];

  return (
    <div className="card">
      <div className="section">
        <h2>{title}</h2>
        <ErrorNote error={list.error} fallback={`Could not load ${title.toLowerCase()}`} />
        {list.isPending && <Loading />}

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Active</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td>{r.isActive ? 'Yes' : 'No'}</td>
                </tr>
              ))}
              {list.data && rows.length === 0 && (
                <tr>
                  <td colSpan={2} className="muted">
                    None defined.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {canManage && (
          <>
            {formErr && (
              <div className="alert" role="alert">
                {formErr}
              </div>
            )}
            <ErrorNote error={create.error} fallback="Could not create the record" />
            <form onSubmit={onCreate} className="row" style={{ marginTop: 12 }}>
              <input
                placeholder={`New ${title.replace(/s$/, '').toLowerCase()} name`}
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
