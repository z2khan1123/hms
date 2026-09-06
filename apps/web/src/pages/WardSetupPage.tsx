import { useState, type FormEvent, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createBedRangeSchema,
  createBedSchema,
  createBedTypeSchema,
  createFloorSchema,
  createWardSchema,
  formatMoney,
  toMajor,
  toMinor,
  updateBedTypeSchema,
  updateFloorSchema,
  updateWardSchema,
  type Bed,
  type BedType,
  type Floor,
  type Ward,
} from '@hms/shared';
import { api } from '../lib/api';
import { useCan } from '../lib/permissions';
import { num } from '../lib/bill-line';
import { ErrorNote, Loading } from '../components/QueryFeedback';
import { Tabs } from '../components/Tabs';

type TabKey = 'floors' | 'bedtypes' | 'wards' | 'beds';

const TABS = [
  { value: 'floors', label: 'Floors' },
  { value: 'bedtypes', label: 'Bed types' },
  { value: 'wards', label: 'Wards' },
  { value: 'beds', label: 'Beds' },
] as const satisfies readonly { value: TabKey; label: string }[];

function zodIssues(error: {
  issues: { path: (string | number)[]; message: string }[];
}): string[] {
  return error.issues.map((i) =>
    i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message,
  );
}

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

export function WardSetupPage() {
  const [tab, setTab] = useState<TabKey>('floors');

  return (
    <>
      <div className="page-head">
        <h1>Ward setup</h1>
      </div>
      <Tabs tabs={TABS} value={tab} onChange={setTab} ariaLabel="Ward setup" />
      {tab === 'floors' && <FloorsTab />}
      {tab === 'bedtypes' && <BedTypesTab />}
      {tab === 'wards' && <WardsTab />}
      {tab === 'beds' && <BedsTab />}
    </>
  );
}

// ---------------------------------------------------------------------------
// Floors
// ---------------------------------------------------------------------------

function FloorsTab() {
  const canManage = useCan()('ward:manage');
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['wards'] });

  const floors = useQuery({
    queryKey: ['wards', 'floors'],
    queryFn: async () => {
      const { data } = await api.get<Floor[]>('/wards/floors');
      return data;
    },
  });

  const [name, setName] = useState('');
  const [sortOrder, setSortOrder] = useState('');
  const [issues, setIssues] = useState<string[]>([]);

  const create = useMutation({
    mutationFn: async (payload: unknown) => {
      await api.post('/wards/floors', payload);
    },
    onSuccess: async () => {
      setName('');
      setSortOrder('');
      setIssues([]);
      await invalidate();
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: unknown }) => {
      await api.patch(`/wards/floors/${id}`, patch);
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/wards/floors/${id}`);
    },
    onSuccess: invalidate,
  });

  function onCreate(event: FormEvent) {
    event.preventDefault();
    setIssues([]);
    const parsed = createFloorSchema.safeParse({
      name: name.trim(),
      sortOrder: sortOrder.trim() ? Number(sortOrder) : undefined,
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
          <h2>Floors</h2>
          <ErrorNote error={floors.error} fallback="Could not load floors" />
          {floors.isPending && <Loading />}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th className="num">Sort</th>
                  <th>Active</th>
                  {canManage && <th />}
                </tr>
              </thead>
              <tbody>
                {floors.data?.map((f) => (
                  <NameRow
                    key={f.id}
                    name={f.name}
                    extraCell={<span className="num">{f.sortOrder}</span>}
                    isActive={f.isActive}
                    canManage={canManage}
                    busy={update.isPending || remove.isPending}
                    onRename={(next) =>
                      update.mutate({
                        id: f.id,
                        patch: updateFloorSchema.parse({ name: next }),
                      })
                    }
                    onToggle={() =>
                      update.mutate({ id: f.id, patch: { isActive: !f.isActive } })
                    }
                    onDelete={() => remove.mutate(f.id)}
                  />
                ))}
                {floors.data && floors.data.length === 0 && (
                  <tr>
                    <td colSpan={canManage ? 4 : 3} className="muted">
                      No floors yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <ErrorNote error={update.error} fallback="Could not update the floor" />
          <ErrorNote error={remove.error} fallback="Could not delete the floor" />
        </div>
      </div>

      {canManage && (
        <div className="card">
          <div className="section">
            <h2>New floor</h2>
            <IssueList issues={issues} />
            <ErrorNote error={create.error} fallback="Could not create the floor" />
            <form onSubmit={onCreate} noValidate>
              <div className="field">
                <label htmlFor="floor-name">Name</label>
                <input
                  id="floor-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="floor-sort">
                  Sort order <span className="muted">(optional)</span>
                </label>
                <input
                  id="floor-sort"
                  type="number"
                  min="0"
                  max="999"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                />
              </div>
              <button type="submit" disabled={create.isPending}>
                {create.isPending ? 'Creating…' : 'Create floor'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bed types
// ---------------------------------------------------------------------------

function BedTypesTab() {
  const canManage = useCan()('ward:manage');
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['wards'] });

  const bedTypes = useQuery({
    queryKey: ['wards', 'bed-types'],
    queryFn: async () => {
      const { data } = await api.get<BedType[]>('/wards/bed-types');
      return data;
    },
  });

  const [name, setName] = useState('');
  const [rateMajor, setRateMajor] = useState('');
  const [issues, setIssues] = useState<string[]>([]);

  const create = useMutation({
    mutationFn: async (payload: unknown) => {
      await api.post('/wards/bed-types', payload);
    },
    onSuccess: async () => {
      setName('');
      setRateMajor('');
      setIssues([]);
      await invalidate();
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: unknown }) => {
      await api.patch(`/wards/bed-types/${id}`, patch);
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/wards/bed-types/${id}`);
    },
    onSuccess: invalidate,
  });

  function onCreate(event: FormEvent) {
    event.preventDefault();
    setIssues([]);
    const parsed = createBedTypeSchema.safeParse({
      name: name.trim(),
      defaultNightlyRateMinor: rateMajor.trim() ? toMinor(num(rateMajor)) : undefined,
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
          <h2>Bed types</h2>
          <p className="muted">
            A bed type's nightly rate is only a suggestion — it pre-fills the bed
            charge at discharge and stays editable on the patient's file.
          </p>
          <ErrorNote error={bedTypes.error} fallback="Could not load bed types" />
          {bedTypes.isPending && <Loading />}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th className="num">Suggested nightly rate</th>
                  <th>Active</th>
                  {canManage && <th />}
                </tr>
              </thead>
              <tbody>
                {bedTypes.data?.map((bt) => (
                  <BedTypeRow
                    key={bt.id}
                    bedType={bt}
                    canManage={canManage}
                    busy={update.isPending || remove.isPending}
                    onSave={(patch) => update.mutate({ id: bt.id, patch })}
                    onDelete={() => remove.mutate(bt.id)}
                  />
                ))}
                {bedTypes.data && bedTypes.data.length === 0 && (
                  <tr>
                    <td colSpan={canManage ? 4 : 3} className="muted">
                      No bed types yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <ErrorNote error={update.error} fallback="Could not update the bed type" />
          <ErrorNote error={remove.error} fallback="Could not delete the bed type" />
        </div>
      </div>

      {canManage && (
        <div className="card">
          <div className="section">
            <h2>New bed type</h2>
            <IssueList issues={issues} />
            <ErrorNote error={create.error} fallback="Could not create the bed type" />
            <form onSubmit={onCreate} noValidate>
              <div className="field">
                <label htmlFor="bt-name">Name</label>
                <input
                  id="bt-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="bt-rate">
                  Suggested nightly rate (PKR) <span className="muted">(optional)</span>
                </label>
                <input
                  id="bt-rate"
                  type="number"
                  min="0"
                  step="0.01"
                  value={rateMajor}
                  onChange={(e) => setRateMajor(e.target.value)}
                />
                <span className="hint">
                  A suggestion only — pre-fills the bed charge, always editable.
                </span>
              </div>
              <button type="submit" disabled={create.isPending}>
                {create.isPending ? 'Creating…' : 'Create bed type'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function BedTypeRow({
  bedType,
  canManage,
  busy,
  onSave,
  onDelete,
}: {
  bedType: BedType;
  canManage: boolean;
  busy: boolean;
  onSave: (patch: unknown) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(bedType.name);
  const [rateMajor, setRateMajor] = useState(
    bedType.defaultNightlyRateMinor != null
      ? String(toMajor(bedType.defaultNightlyRateMinor))
      : '',
  );
  const [issue, setIssue] = useState<string | null>(null);

  function start() {
    setName(bedType.name);
    setRateMajor(
      bedType.defaultNightlyRateMinor != null
        ? String(toMajor(bedType.defaultNightlyRateMinor))
        : '',
    );
    setIssue(null);
    setEditing(true);
  }

  function save() {
    const parsed = updateBedTypeSchema.safeParse({
      name: name.trim(),
      defaultNightlyRateMinor: rateMajor.trim() ? toMinor(num(rateMajor)) : null,
    });
    if (!parsed.success) {
      setIssue(zodIssues(parsed.error)[0] ?? 'Check the values');
      return;
    }
    onSave(parsed.data);
    setEditing(false);
  }

  if (!editing) {
    return (
      <tr>
        <td>{bedType.name}</td>
        <td className="num">
          {bedType.defaultNightlyRateMinor != null
            ? formatMoney(bedType.defaultNightlyRateMinor)
            : '—'}
        </td>
        <td>{bedType.isActive ? 'Yes' : 'No'}</td>
        {canManage && (
          <td>
            <div className="row">
              <button type="button" className="secondary" onClick={start}>
                Edit
              </button>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => onSave({ isActive: !bedType.isActive })}
              >
                {bedType.isActive ? 'Deactivate' : 'Activate'}
              </button>
              <button type="button" className="danger" disabled={busy} onClick={onDelete}>
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
        <input value={name} onChange={(e) => setName(e.target.value)} aria-label="Bed type name" />
        {issue && <div className="hint">{issue}</div>}
      </td>
      <td className="num">
        <input
          type="number"
          min="0"
          step="0.01"
          value={rateMajor}
          onChange={(e) => setRateMajor(e.target.value)}
          aria-label="Suggested nightly rate"
        />
      </td>
      <td>{bedType.isActive ? 'Yes' : 'No'}</td>
      <td>
        <div className="row">
          <button type="button" disabled={busy} onClick={save}>
            Save
          </button>
          <button type="button" className="secondary" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Wards
// ---------------------------------------------------------------------------

function WardsTab() {
  const canManage = useCan()('ward:manage');
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['wards'] });

  const floors = useQuery({
    queryKey: ['wards', 'floors'],
    queryFn: async () => {
      const { data } = await api.get<Floor[]>('/wards/floors');
      return data;
    },
  });

  const wards = useQuery({
    queryKey: ['wards', 'list'],
    queryFn: async () => {
      const { data } = await api.get<Ward[]>('/wards');
      return data;
    },
  });

  const [floorId, setFloorId] = useState('');
  const [name, setName] = useState('');
  const [issues, setIssues] = useState<string[]>([]);

  const create = useMutation({
    mutationFn: async (payload: unknown) => {
      await api.post('/wards', payload);
    },
    onSuccess: async () => {
      setName('');
      setIssues([]);
      await invalidate();
    },
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: unknown }) => {
      await api.patch(`/wards/${id}`, patch);
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/wards/${id}`);
    },
    onSuccess: invalidate,
  });

  function onCreate(event: FormEvent) {
    event.preventDefault();
    setIssues([]);
    const parsed = createWardSchema.safeParse({ floorId, name: name.trim() });
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
          <h2>Wards</h2>
          <ErrorNote error={wards.error} fallback="Could not load wards" />
          {wards.isPending && <Loading />}
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Floor</th>
                  <th>Active</th>
                  {canManage && <th />}
                </tr>
              </thead>
              <tbody>
                {wards.data?.map((w) => (
                  <NameRow
                    key={w.id}
                    name={w.name}
                    extraCell={w.floor.name}
                    isActive={w.isActive}
                    canManage={canManage}
                    busy={update.isPending || remove.isPending}
                    onRename={(next) =>
                      update.mutate({
                        id: w.id,
                        patch: updateWardSchema.parse({ name: next }),
                      })
                    }
                    onToggle={() =>
                      update.mutate({ id: w.id, patch: { isActive: !w.isActive } })
                    }
                    onDelete={() => remove.mutate(w.id)}
                  />
                ))}
                {wards.data && wards.data.length === 0 && (
                  <tr>
                    <td colSpan={canManage ? 4 : 3} className="muted">
                      No wards yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <ErrorNote error={update.error} fallback="Could not update the ward" />
          <ErrorNote error={remove.error} fallback="Could not delete the ward" />
        </div>
      </div>

      {canManage && (
        <div className="card">
          <div className="section">
            <h2>New ward</h2>
            <IssueList issues={issues} />
            <ErrorNote error={create.error} fallback="Could not create the ward" />
            <ErrorNote error={floors.error} fallback="Could not load floors" />
            <form onSubmit={onCreate} noValidate>
              <div className="field">
                <label htmlFor="ward-floor">Floor</label>
                <select
                  id="ward-floor"
                  value={floorId}
                  onChange={(e) => setFloorId(e.target.value)}
                >
                  <option value="">Select a floor…</option>
                  {floors.data?.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="ward-name">Name</label>
                <input
                  id="ward-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <button type="submit" disabled={create.isPending}>
                {create.isPending ? 'Creating…' : 'Create ward'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Beds
// ---------------------------------------------------------------------------

function BedsTab() {
  const canManage = useCan()('ward:manage');
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['wards'] });

  const [includeInactive, setIncludeInactive] = useState(true);

  const wards = useQuery({
    queryKey: ['wards', 'list'],
    queryFn: async () => {
      const { data } = await api.get<Ward[]>('/wards');
      return data;
    },
  });

  const bedTypes = useQuery({
    queryKey: ['wards', 'bed-types'],
    queryFn: async () => {
      const { data } = await api.get<BedType[]>('/wards/bed-types');
      return data;
    },
  });

  const beds = useQuery({
    // Full bed inventory for setup — distinct from the board's available-only key.
    queryKey: ['wards', 'beds', 'setup', includeInactive],
    queryFn: async () => {
      const { data } = await api.get<Bed[]>('/wards/beds', {
        params: { includeInactive: includeInactive || undefined },
      });
      return data;
    },
  });

  // shared "where" fields
  const [wardId, setWardId] = useState('');
  const [bedTypeId, setBedTypeId] = useState('');

  // single
  const [bedName, setBedName] = useState('');
  const [singleIssues, setSingleIssues] = useState<string[]>([]);

  // range
  const [prefix, setPrefix] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [pad, setPad] = useState('');
  const [rangeIssues, setRangeIssues] = useState<string[]>([]);

  const createSingle = useMutation({
    mutationFn: async (payload: unknown) => {
      await api.post('/wards/beds', payload);
    },
    onSuccess: async () => {
      setBedName('');
      setSingleIssues([]);
      await invalidate();
    },
  });

  const createRange = useMutation({
    mutationFn: async (payload: unknown) => {
      await api.post('/wards/beds/range', payload);
    },
    onSuccess: async () => {
      setPrefix('');
      setFrom('');
      setTo('');
      setPad('');
      setRangeIssues([]);
      await invalidate();
    },
  });

  function onCreateSingle(event: FormEvent) {
    event.preventDefault();
    setSingleIssues([]);
    const parsed = createBedSchema.safeParse({
      wardId,
      bedTypeId,
      name: bedName.trim(),
    });
    if (!parsed.success) {
      setSingleIssues(zodIssues(parsed.error));
      return;
    }
    createSingle.mutate(parsed.data);
  }

  function onCreateRange(event: FormEvent) {
    event.preventDefault();
    setRangeIssues([]);
    const parsed = createBedRangeSchema.safeParse({
      wardId,
      bedTypeId,
      prefix: prefix.trim(),
      from: from.trim() ? Number(from) : undefined,
      to: to.trim() ? Number(to) : undefined,
      pad: pad.trim() ? Number(pad) : undefined,
    });
    if (!parsed.success) {
      setRangeIssues(zodIssues(parsed.error));
      return;
    }
    createRange.mutate(parsed.data);
  }

  const grouped = groupBedsByWard(beds.data ?? []);

  return (
    <div className="split">
      <div className="card">
        <div className="section">
          <h2>Beds</h2>
          <div className="check-row">
            <label>
              <input
                type="checkbox"
                checked={includeInactive}
                onChange={(e) => setIncludeInactive(e.target.checked)}
              />
              Show inactive
            </label>
          </div>
          <ErrorNote error={beds.error} fallback="Could not load beds" />
          {beds.isPending && <Loading />}
          {grouped.length === 0 && beds.isSuccess && (
            <p className="muted">No beds yet.</p>
          )}
          {grouped.map((group) => (
            <div key={group.wardName} style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 13, color: 'var(--muted)', margin: '0 0 6px' }}>
                {group.wardName}
              </h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Bed</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Active</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.beds.map((b) => (
                      <tr key={b.id}>
                        <td>{b.name}</td>
                        <td>{b.bedType.name}</td>
                        <td>
                          <span className={`badge badge-${b.status}`}>{b.status}</span>
                        </td>
                        <td>{b.isActive ? 'Yes' : 'No'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </div>

      {canManage && (
        <div className="card">
          <div className="section">
            <h2>Where</h2>
            <ErrorNote error={wards.error} fallback="Could not load wards" />
            <ErrorNote error={bedTypes.error} fallback="Could not load bed types" />
            <div className="field">
              <label htmlFor="bed-ward">Ward</label>
              <select
                id="bed-ward"
                value={wardId}
                onChange={(e) => setWardId(e.target.value)}
              >
                <option value="">Select a ward…</option>
                {wards.data?.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} · {w.floor.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="bed-type">Bed type</label>
              <select
                id="bed-type"
                value={bedTypeId}
                onChange={(e) => setBedTypeId(e.target.value)}
              >
                <option value="">Select a bed type…</option>
                {bedTypes.data?.map((bt) => (
                  <option key={bt.id} value={bt.id}>
                    {bt.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="section">
            <h2>Add one bed</h2>
            <IssueList issues={singleIssues} />
            <ErrorNote error={createSingle.error} fallback="Could not create the bed" />
            <form onSubmit={onCreateSingle} noValidate>
              <div className="field">
                <label htmlFor="bed-name">Bed name</label>
                <input
                  id="bed-name"
                  value={bedName}
                  onChange={(e) => setBedName(e.target.value)}
                  placeholder="e.g. GF-1"
                />
              </div>
              <button type="submit" disabled={createSingle.isPending}>
                {createSingle.isPending ? 'Adding…' : 'Add bed'}
              </button>
            </form>
          </div>

          <div className="section">
            <h2>Add a range</h2>
            <p className="muted">
              Nobody types GF-1 to GF-20 by hand — set a prefix and a number range.
            </p>
            <IssueList issues={rangeIssues} />
            <ErrorNote error={createRange.error} fallback="Could not create the beds" />
            <form onSubmit={onCreateRange} noValidate>
              <div className="field">
                <label htmlFor="range-prefix">Prefix</label>
                <input
                  id="range-prefix"
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value)}
                  placeholder="e.g. GF-"
                />
              </div>
              <div className="form-grid-3">
                <div className="field">
                  <label htmlFor="range-from">From</label>
                  <input
                    id="range-from"
                    type="number"
                    min="0"
                    max="9999"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="range-to">To</label>
                  <input
                    id="range-to"
                    type="number"
                    min="0"
                    max="9999"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="range-pad">
                    Pad <span className="muted">(optional)</span>
                  </label>
                  <input
                    id="range-pad"
                    type="number"
                    min="1"
                    max="6"
                    value={pad}
                    onChange={(e) => setPad(e.target.value)}
                  />
                </div>
              </div>
              <span className="hint">
                Pad 3 gives {prefix || 'GF-'}
                {String(from.trim() ? from : '1').padStart(3, '0')}.
              </span>
              <div style={{ marginTop: 10 }}>
                <button type="submit" disabled={createRange.isPending}>
                  {createRange.isPending ? 'Adding…' : 'Add range'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function groupBedsByWard(beds: Bed[]): { wardName: string; beds: Bed[] }[] {
  const map = new Map<string, { wardName: string; beds: Bed[] }>();
  for (const bed of beds) {
    const key = `${bed.ward.floor.name} · ${bed.ward.name}`;
    const group = map.get(key) ?? { wardName: key, beds: [] };
    group.beds.push(bed);
    map.set(key, group);
  }
  return [...map.values()].sort((a, b) => a.wardName.localeCompare(b.wardName));
}

// ---------------------------------------------------------------------------
// Shared name/rename row
// ---------------------------------------------------------------------------

function NameRow({
  name,
  extraCell,
  isActive,
  canManage,
  busy,
  onRename,
  onToggle,
  onDelete,
}: {
  name: string;
  extraCell: ReactNode;
  isActive: boolean;
  canManage: boolean;
  busy: boolean;
  onRename: (next: string) => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);

  if (!editing) {
    return (
      <tr>
        <td>{name}</td>
        <td>{extraCell}</td>
        <td>{isActive ? 'Yes' : 'No'}</td>
        {canManage && (
          <td>
            <div className="row">
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setValue(name);
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
                {isActive ? 'Deactivate' : 'Activate'}
              </button>
              <button type="button" className="danger" disabled={busy} onClick={onDelete}>
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
          value={value}
          onChange={(e) => setValue(e.target.value)}
          aria-label="Name"
        />
      </td>
      <td>{extraCell}</td>
      <td>{isActive ? 'Yes' : 'No'}</td>
      <td>
        <div className="row">
          <button
            type="button"
            disabled={busy || !value.trim()}
            onClick={() => {
              onRename(value.trim());
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
