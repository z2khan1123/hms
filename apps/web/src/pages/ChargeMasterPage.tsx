import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CHARGE_TYPE_LABELS,
  chargeTypeKindSchema,
  createChargeCategorySchema,
  createChargeSchema,
  createTaxCategorySchema,
  createUnitTypeSchema,
  formatBps,
  formatMoney,
  percentToBps,
  toMinor,
  type Charge,
  type ChargeCategory,
  type ChargeTypeKind,
  type TaxCategory,
  type UnitType,
} from '@hms/shared';
import { api } from '../lib/api';
import { useCan } from '../lib/permissions';
import { num } from '../lib/charge-line';
import { blankToUndefined } from '../lib/format';
import { ErrorNote, Loading } from '../components/QueryFeedback';
import { Tabs } from '../components/Tabs';

type TabKey = 'charges' | 'categories' | 'tax' | 'units';

const TABS = [
  { value: 'charges', label: 'Charges' },
  { value: 'categories', label: 'Categories' },
  { value: 'tax', label: 'Tax categories' },
  { value: 'units', label: 'Unit types' },
] as const satisfies readonly { value: TabKey; label: string }[];

const CHARGE_TYPES = chargeTypeKindSchema.options;

function IssueList({ issues }: { issues: string[] }) {
  if (issues.length === 0) return null;
  return (
    <div className="alert" role="alert">
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {issues.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  );
}

function zodIssues(error: { issues: { path: (string | number)[]; message: string }[] }): string[] {
  return error.issues.map((i) =>
    i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message,
  );
}

export function ChargeMasterPage() {
  const can = useCan();
  const canManage = can('charge_master:manage');
  const [tab, setTab] = useState<TabKey>('charges');

  return (
    <>
      <div className="page-head">
        <h1>Charge master</h1>
      </div>

      <Tabs tabs={TABS} value={tab} onChange={setTab} ariaLabel="Charge master sections" />

      {tab === 'charges' && <ChargesTab canManage={canManage} />}
      {tab === 'categories' && <CategoriesTab canManage={canManage} />}
      {tab === 'tax' && <TaxCategoriesTab canManage={canManage} />}
      {tab === 'units' && <UnitTypesTab canManage={canManage} />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Charges
// ---------------------------------------------------------------------------

function ChargesTab({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState<'' | ChargeTypeKind>('');

  const charges = useQuery({
    queryKey: ['charge-master', 'charges', 'manage', typeFilter],
    queryFn: async () => {
      const { data } = await api.get<Charge[]>('/charge-master/charges', {
        params: { chargeType: typeFilter || undefined, includeInactive: true },
      });
      return data;
    },
  });

  const categories = useQuery({
    queryKey: ['charge-master', 'categories'],
    queryFn: async () => {
      const { data } = await api.get<ChargeCategory[]>('/charge-master/categories');
      return data;
    },
  });

  const taxCategories = useQuery({
    queryKey: ['charge-master', 'tax-categories'],
    queryFn: async () => {
      const { data } = await api.get<TaxCategory[]>('/charge-master/tax-categories');
      return data;
    },
  });

  const unitTypes = useQuery({
    queryKey: ['charge-master', 'unit-types'],
    queryFn: async () => {
      const { data } = await api.get<UnitType[]>('/charge-master/unit-types');
      return data;
    },
  });

  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [unitTypeId, setUnitTypeId] = useState('');
  const [taxCategoryId, setTaxCategoryId] = useState('');
  const [priceMajor, setPriceMajor] = useState('');
  const [description, setDescription] = useState('');
  const [issues, setIssues] = useState<string[]>([]);

  const create = useMutation({
    mutationFn: async (payload: unknown) => {
      const { data } = await api.post('/charge-master/charges', payload);
      return data;
    },
    onSuccess: async () => {
      setName('');
      setUnitTypeId('');
      setTaxCategoryId('');
      setPriceMajor('');
      setDescription('');
      setIssues([]);
      await queryClient.invalidateQueries({ queryKey: ['charge-master', 'charges'] });
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setIssues([]);
    const payload = {
      chargeCategoryId: categoryId,
      unitTypeId: unitTypeId || undefined,
      taxCategoryId: taxCategoryId || undefined,
      name: name.trim(),
      standardChargeMinor: toMinor(num(priceMajor)),
      description: blankToUndefined(description),
    };
    const parsed = createChargeSchema.safeParse(payload);
    if (!parsed.success) {
      setIssues(zodIssues(parsed.error));
      return;
    }
    create.mutate(parsed.data);
  }

  return (
    <div className="split">
      <div className="card">
        <div className="section">
          <h2>Charges</h2>
          <div className="toolbar">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as '' | ChargeTypeKind)}
              aria-label="Filter by department"
              style={{ maxWidth: 240 }}
            >
              <option value="">All departments</option>
              {CHARGE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {CHARGE_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
          <ErrorNote error={charges.error} fallback="Could not load charges" />
          {charges.isPending && <Loading />}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Category</th>
                  <th>Tax</th>
                  <th className="num">Standard</th>
                  <th>Active</th>
                </tr>
              </thead>
              <tbody>
                {charges.data?.map((c) => (
                  <tr key={c.id}>
                    <td>
                      {c.name}
                      {c.unitType ? <div className="muted">per {c.unitType.name}</div> : null}
                    </td>
                    <td>{c.chargeCategory.name}</td>
                    <td>
                      {c.taxCategory
                        ? `${c.taxCategory.name} (${formatBps(c.taxCategory.rateBps)})`
                        : '—'}
                    </td>
                    <td className="num">{formatMoney(c.standardChargeMinor)}</td>
                    <td>{c.isActive ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
                {charges.data && charges.data.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted">
                      No charges defined.
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
            <h2>New charge</h2>
            <IssueList issues={issues} />
            <ErrorNote error={create.error} fallback="Could not create the charge" />
            <ErrorNote error={categories.error} fallback="Could not load categories" />
            <form onSubmit={onSubmit} noValidate>
              <div className="field">
                <label htmlFor="ch-name">Name</label>
                <input id="ch-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="ch-category">Category</label>
                <select
                  id="ch-category"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  disabled={categories.isPending}
                >
                  <option value="">Select a category…</option>
                  {categories.data?.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} — {CHARGE_TYPE_LABELS[c.chargeType]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="ch-unit">Unit type</label>
                  <select
                    id="ch-unit"
                    value={unitTypeId}
                    onChange={(e) => setUnitTypeId(e.target.value)}
                  >
                    <option value="">—</option>
                    {unitTypes.data?.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="ch-tax">Tax category</label>
                  <select
                    id="ch-tax"
                    value={taxCategoryId}
                    onChange={(e) => setTaxCategoryId(e.target.value)}
                  >
                    <option value="">—</option>
                    {taxCategories.data?.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({formatBps(t.rateBps)})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="field">
                <label htmlFor="ch-price">Standard charge (PKR)</label>
                <input
                  id="ch-price"
                  type="number"
                  min="0"
                  step="0.01"
                  value={priceMajor}
                  onChange={(e) => setPriceMajor(e.target.value)}
                />
                <span className="hint">Entered in rupees; stored in paisa.</span>
              </div>
              <div className="field">
                <label htmlFor="ch-desc">Description</label>
                <textarea
                  id="ch-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <button type="submit" disabled={create.isPending}>
                {create.isPending ? 'Creating…' : 'Create charge'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

function CategoriesTab({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: ['charge-master', 'categories'],
    queryFn: async () => {
      const { data } = await api.get<ChargeCategory[]>('/charge-master/categories');
      return data;
    },
  });

  const [name, setName] = useState('');
  const [chargeType, setChargeType] = useState<ChargeTypeKind>('opd');
  const [issues, setIssues] = useState<string[]>([]);

  const create = useMutation({
    mutationFn: async (payload: unknown) => {
      const { data } = await api.post('/charge-master/categories', payload);
      return data;
    },
    onSuccess: async () => {
      setName('');
      setIssues([]);
      await queryClient.invalidateQueries({ queryKey: ['charge-master', 'categories'] });
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setIssues([]);
    const parsed = createChargeCategorySchema.safeParse({ name: name.trim(), chargeType });
    if (!parsed.success) {
      setIssues(zodIssues(parsed.error));
      return;
    }
    create.mutate(parsed.data);
  }

  return (
    <div className="split">
      <div className="card">
        <div className="section">
          <h2>Categories</h2>
          <ErrorNote error={list.error} fallback="Could not load categories" />
          {list.isPending && <Loading />}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Department</th>
                  <th>Active</th>
                </tr>
              </thead>
              <tbody>
                {list.data?.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td>{CHARGE_TYPE_LABELS[c.chargeType]}</td>
                    <td>{c.isActive ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
                {list.data && list.data.length === 0 && (
                  <tr>
                    <td colSpan={3} className="muted">
                      No categories defined.
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
            <h2>New category</h2>
            <IssueList issues={issues} />
            <ErrorNote error={create.error} fallback="Could not create the category" />
            <form onSubmit={onSubmit} noValidate>
              <div className="field">
                <label htmlFor="cat-name">Name</label>
                <input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="cat-type">Department</label>
                <select
                  id="cat-type"
                  value={chargeType}
                  onChange={(e) => setChargeType(e.target.value as ChargeTypeKind)}
                >
                  {CHARGE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {CHARGE_TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" disabled={create.isPending}>
                {create.isPending ? 'Creating…' : 'Create category'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tax categories
// ---------------------------------------------------------------------------

function TaxCategoriesTab({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: ['charge-master', 'tax-categories'],
    queryFn: async () => {
      const { data } = await api.get<TaxCategory[]>('/charge-master/tax-categories');
      return data;
    },
  });

  const [name, setName] = useState('');
  const [percent, setPercent] = useState('');
  const [issues, setIssues] = useState<string[]>([]);

  const create = useMutation({
    mutationFn: async (payload: unknown) => {
      const { data } = await api.post('/charge-master/tax-categories', payload);
      return data;
    },
    onSuccess: async () => {
      setName('');
      setPercent('');
      setIssues([]);
      await queryClient.invalidateQueries({
        queryKey: ['charge-master', 'tax-categories'],
      });
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setIssues([]);
    const parsed = createTaxCategorySchema.safeParse({
      name: name.trim(),
      rateBps: percentToBps(num(percent)),
    });
    if (!parsed.success) {
      setIssues(zodIssues(parsed.error));
      return;
    }
    create.mutate(parsed.data);
  }

  return (
    <div className="split">
      <div className="card">
        <div className="section">
          <h2>Tax categories</h2>
          <ErrorNote error={list.error} fallback="Could not load tax categories" />
          {list.isPending && <Loading />}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th className="num">Rate</th>
                  <th>Active</th>
                </tr>
              </thead>
              <tbody>
                {list.data?.map((t) => (
                  <tr key={t.id}>
                    <td>{t.name}</td>
                    <td className="num">{formatBps(t.rateBps)}</td>
                    <td>{t.isActive ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
                {list.data && list.data.length === 0 && (
                  <tr>
                    <td colSpan={3} className="muted">
                      No tax categories defined.
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
            <h2>New tax category</h2>
            <IssueList issues={issues} />
            <ErrorNote error={create.error} fallback="Could not create the tax category" />
            <form onSubmit={onSubmit} noValidate>
              <div className="field">
                <label htmlFor="tax-name">Name</label>
                <input id="tax-name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="tax-rate">Rate (%)</label>
                <input
                  id="tax-rate"
                  type="number"
                  min="0"
                  step="0.01"
                  value={percent}
                  onChange={(e) => setPercent(e.target.value)}
                />
                <span className="hint">Entered as a percentage; stored in basis points.</span>
              </div>
              <button type="submit" disabled={create.isPending}>
                {create.isPending ? 'Creating…' : 'Create tax category'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Unit types
// ---------------------------------------------------------------------------

function UnitTypesTab({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const list = useQuery({
    queryKey: ['charge-master', 'unit-types'],
    queryFn: async () => {
      const { data } = await api.get<UnitType[]>('/charge-master/unit-types');
      return data;
    },
  });

  const [name, setName] = useState('');
  const [issues, setIssues] = useState<string[]>([]);

  const create = useMutation({
    mutationFn: async (payload: unknown) => {
      const { data } = await api.post('/charge-master/unit-types', payload);
      return data;
    },
    onSuccess: async () => {
      setName('');
      setIssues([]);
      await queryClient.invalidateQueries({ queryKey: ['charge-master', 'unit-types'] });
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setIssues([]);
    const parsed = createUnitTypeSchema.safeParse({ name: name.trim() });
    if (!parsed.success) {
      setIssues(zodIssues(parsed.error));
      return;
    }
    create.mutate(parsed.data);
  }

  return (
    <div className="split">
      <div className="card">
        <div className="section">
          <h2>Unit types</h2>
          <ErrorNote error={list.error} fallback="Could not load unit types" />
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
                {list.data?.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>{u.isActive ? 'Yes' : 'No'}</td>
                  </tr>
                ))}
                {list.data && list.data.length === 0 && (
                  <tr>
                    <td colSpan={2} className="muted">
                      No unit types defined.
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
            <h2>New unit type</h2>
            <IssueList issues={issues} />
            <ErrorNote error={create.error} fallback="Could not create the unit type" />
            <form onSubmit={onSubmit} noValidate>
              <div className="field">
                <label htmlFor="unit-name">Name</label>
                <input
                  id="unit-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <button type="submit" disabled={create.isPending}>
                {create.isPending ? 'Creating…' : 'Create unit type'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
