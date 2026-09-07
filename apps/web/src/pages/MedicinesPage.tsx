import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createMedicineSchema,
  updateMedicineSchema,
  type Medicine,
  type MedicineCategory,
} from '@hms/shared';
import { api } from '../lib/api';
import { useCan } from '../lib/permissions';
import { useDebounced } from '../lib/useDebounced';
import { blankToUndefined, formatDate } from '../lib/format';
import { ErrorNote, Loading } from '../components/QueryFeedback';

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

/** "penicillin, sulfa" -> ["penicillin", "sulfa"] */
function parseKeywords(raw: string): string[] {
  return raw
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean);
}

const EMPTY_FORM = {
  name: '',
  genericName: '',
  categoryId: '',
  company: '',
  strength: '',
  unit: '',
  reorderLevel: '',
  allergenKeywords: '',
};

export function MedicinesPage() {
  const can = useCan();
  const canManage = can('medicine:manage');
  const queryClient = useQueryClient();

  const [q, setQ] = useState('');
  const debouncedQ = useDebounced(q);
  const [categoryId, setCategoryId] = useState('');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);

  const categories = useQuery({
    // MedicineCategory[] — its own shape.
    queryKey: ['pharmacy', 'categories'],
    queryFn: async () => {
      const { data } = await api.get<MedicineCategory[]>('/pharmacy/categories');
      return data;
    },
  });

  const medicines = useQuery({
    // Medicine[] for the master list — the filters vary the contents.
    queryKey: [
      'pharmacy',
      'medicines',
      'list',
      debouncedQ,
      categoryId,
      lowStockOnly,
      includeInactive,
    ],
    queryFn: async () => {
      const { data } = await api.get<Medicine[]>('/pharmacy/medicines', {
        params: {
          q: debouncedQ || undefined,
          categoryId: categoryId || undefined,
          lowStockOnly: lowStockOnly || undefined,
          includeInactive: includeInactive || undefined,
        },
      });
      return data;
    },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['pharmacy', 'medicines'] });

  // --- editor (shared by create and edit) --------------------------------
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [issues, setIssues] = useState<string[]>([]);
  const set = (patch: Partial<typeof EMPTY_FORM>) =>
    setForm((prev) => ({ ...prev, ...patch }));

  function resetEditor() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setIssues([]);
  }

  function startEdit(m: Medicine) {
    setEditingId(m.id);
    setForm({
      name: m.name,
      genericName: m.genericName ?? '',
      categoryId: m.category?.id ?? '',
      company: m.company ?? '',
      strength: m.strength ?? '',
      unit: m.unit ?? '',
      reorderLevel: m.reorderLevel != null ? String(m.reorderLevel) : '',
      allergenKeywords: m.allergenKeywords.join(', '),
    });
    setIssues([]);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const save = useMutation({
    mutationFn: async () => {
      const keywords = parseKeywords(form.allergenKeywords);
      if (editingId) {
        const parsed = updateMedicineSchema.safeParse({
          name: form.name.trim(),
          genericName: blankToUndefined(form.genericName) ?? null,
          categoryId: form.categoryId || null,
          company: blankToUndefined(form.company) ?? null,
          strength: blankToUndefined(form.strength) ?? null,
          unit: blankToUndefined(form.unit) ?? null,
          reorderLevel: form.reorderLevel.trim()
            ? Number(form.reorderLevel)
            : null,
          allergenKeywords: keywords,
        });
        if (!parsed.success) throw parsed.error;
        const { data } = await api.patch<Medicine>(
          `/pharmacy/medicines/${editingId}`,
          parsed.data,
        );
        return data;
      }
      const parsed = createMedicineSchema.safeParse({
        name: form.name.trim(),
        genericName: blankToUndefined(form.genericName),
        categoryId: form.categoryId || undefined,
        company: blankToUndefined(form.company),
        strength: blankToUndefined(form.strength),
        unit: blankToUndefined(form.unit),
        reorderLevel: form.reorderLevel.trim()
          ? Number(form.reorderLevel)
          : undefined,
        allergenKeywords: keywords.length ? keywords : undefined,
      });
      if (!parsed.success) throw parsed.error;
      const { data } = await api.post<Medicine>('/pharmacy/medicines', parsed.data);
      return data;
    },
    onSuccess: async () => {
      resetEditor();
      await invalidate();
    },
    onError: (err: unknown) => {
      if (err && typeof err === 'object' && 'issues' in err) {
        setIssues(
          zodIssues(
            err as { issues: { path: (string | number)[]; message: string }[] },
          ),
        );
      }
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setIssues([]);
    save.mutate();
  }

  const toggleActive = useMutation({
    mutationFn: async (m: Medicine) => {
      const { data } = await api.patch<Medicine>(`/pharmacy/medicines/${m.id}`, {
        isActive: !m.isActive,
      });
      return data;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/pharmacy/medicines/${id}`);
    },
    onSuccess: async () => {
      if (editingId) resetEditor();
      await invalidate();
    },
  });

  // --- add a category from inside the form ------------------------------
  const [newCategory, setNewCategory] = useState('');
  const addCategory = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<MedicineCategory>('/pharmacy/categories', {
        name: newCategory.trim(),
      });
      return data;
    },
    onSuccess: async (created) => {
      setNewCategory('');
      await queryClient.invalidateQueries({
        queryKey: ['pharmacy', 'categories'],
      });
      set({ categoryId: created.id });
    },
  });

  const rows = medicines.data ?? [];

  return (
    <>
      <div className="page-head">
        <h1>Medicines</h1>
      </div>

      <div className="split">
        <div className="card">
          <div className="section">
            <h2>Medicine master</h2>
            <p className="muted">
              Every stocked medicine, its counting unit and its stock on hand
              summed across batches that have not expired. A medicine at or below
              its reorder level is flagged <strong>Low</strong>.
            </p>
            <div className="toolbar">
              <input
                placeholder="Search name or generic"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Search medicines"
              />
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                aria-label="Filter by category"
                style={{ maxWidth: 200 }}
              >
                <option value="">All categories</option>
                {categories.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
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
                  checked={lowStockOnly}
                  onChange={(e) => setLowStockOnly(e.target.checked)}
                />
                Low stock only
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
                  checked={includeInactive}
                  onChange={(e) => setIncludeInactive(e.target.checked)}
                />
                Include inactive
              </label>
            </div>

            <ErrorNote error={medicines.error} fallback="Could not load medicines" />
            {medicines.isPending && <Loading label="Loading medicines…" />}

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Generic</th>
                    <th>Category</th>
                    <th>Strength</th>
                    <th>Unit</th>
                    <th className="num">Stock on hand</th>
                    <th className="num">Reorder level</th>
                    <th>Next expiry</th>
                    {canManage && <th className="no-print" />}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((m) => (
                    <tr
                      key={m.id}
                      className={m.belowReorderLevel ? 'row-low' : undefined}
                    >
                      <td>
                        {m.name}
                        {!m.isActive && <span className="muted"> · inactive</span>}
                      </td>
                      <td>{m.genericName ?? <span className="muted">—</span>}</td>
                      <td>{m.category?.name ?? <span className="muted">—</span>}</td>
                      <td>{m.strength ?? <span className="muted">—</span>}</td>
                      <td>{m.unit ?? <span className="muted">—</span>}</td>
                      <td className="num">
                        {m.stockOnHand}{' '}
                        {m.belowReorderLevel ? (
                          <span className="stock-tag stock-low">Low</span>
                        ) : null}
                      </td>
                      <td className="num">
                        {m.reorderLevel != null ? (
                          m.reorderLevel
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      <td>
                        {m.nextExpiryDate ? (
                          formatDate(m.nextExpiryDate)
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                      {canManage && (
                        <td className="no-print">
                          <div className="row">
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => startEdit(m)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="secondary"
                              disabled={toggleActive.isPending}
                              onClick={() => toggleActive.mutate(m)}
                            >
                              {m.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                            <button
                              type="button"
                              className="danger"
                              disabled={remove.isPending}
                              onClick={() => remove.mutate(m.id)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                  {medicines.data && rows.length === 0 && (
                    <tr>
                      <td colSpan={canManage ? 9 : 8} className="muted">
                        No medicines match.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <ErrorNote error={toggleActive.error} fallback="Could not update the medicine" />
            <ErrorNote error={remove.error} fallback="Could not delete the medicine" />
          </div>
        </div>

        {canManage && (
          <div className="card">
            <div className="section">
              <h2>{editingId ? 'Edit medicine' : 'New medicine'}</h2>
              <IssueList issues={issues} />
              <ErrorNote error={save.error} fallback="Could not save the medicine" />
              <form onSubmit={onSubmit} noValidate>
                <div className="field">
                  <label htmlFor="med-name">Name</label>
                  <input
                    id="med-name"
                    value={form.name}
                    onChange={(e) => set({ name: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="med-generic">
                    Generic name <span className="muted">(optional)</span>
                  </label>
                  <input
                    id="med-generic"
                    value={form.genericName}
                    onChange={(e) => set({ genericName: e.target.value })}
                  />
                </div>
                <div className="field">
                  <label htmlFor="med-category">
                    Category <span className="muted">(optional)</span>
                  </label>
                  <select
                    id="med-category"
                    value={form.categoryId}
                    onChange={(e) => set({ categoryId: e.target.value })}
                  >
                    <option value="">—</option>
                    {categories.data?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <div className="row no-print" style={{ marginTop: 6 }}>
                    <input
                      placeholder="New category name"
                      value={newCategory}
                      onChange={(e) => setNewCategory(e.target.value)}
                      aria-label="New category name"
                    />
                    <button
                      type="button"
                      className="secondary"
                      disabled={!newCategory.trim() || addCategory.isPending}
                      onClick={() => addCategory.mutate()}
                    >
                      Add category
                    </button>
                  </div>
                  <ErrorNote
                    error={addCategory.error}
                    fallback="Could not add the category"
                  />
                </div>
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="med-company">
                      Company <span className="muted">(optional)</span>
                    </label>
                    <input
                      id="med-company"
                      value={form.company}
                      onChange={(e) => set({ company: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="med-strength">
                      Strength <span className="muted">(optional)</span>
                    </label>
                    <input
                      id="med-strength"
                      value={form.strength}
                      onChange={(e) => set({ strength: e.target.value })}
                      placeholder="e.g. 500 mg"
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="med-unit">
                      Unit <span className="muted">(optional)</span>
                    </label>
                    <input
                      id="med-unit"
                      value={form.unit}
                      onChange={(e) => set({ unit: e.target.value })}
                      placeholder="tablet, capsule, bottle, vial"
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="med-reorder">
                      Reorder level <span className="muted">(optional)</span>
                    </label>
                    <input
                      id="med-reorder"
                      type="number"
                      min="0"
                      step="1"
                      value={form.reorderLevel}
                      onChange={(e) => set({ reorderLevel: e.target.value })}
                    />
                  </div>
                </div>
                <div className="field">
                  <label htmlFor="med-allergens">
                    Allergen keywords <span className="muted">(optional)</span>
                  </label>
                  <input
                    id="med-allergens"
                    value={form.allergenKeywords}
                    onChange={(e) => set({ allergenKeywords: e.target.value })}
                    placeholder="penicillin, amoxicillin, beta-lactam"
                  />
                  <span className="hint">
                    A plain comma-separated list of substances this medicine
                    contains. This is exactly what a patient's recorded allergies
                    are checked against when the medicine is prescribed or
                    dispensed.
                  </span>
                </div>

                <div className="row no-print" style={{ marginTop: 4 }}>
                  <button type="submit" disabled={save.isPending}>
                    {save.isPending
                      ? 'Saving…'
                      : editingId
                        ? 'Save changes'
                        : 'Create medicine'}
                  </button>
                  {editingId && (
                    <button
                      type="button"
                      className="secondary"
                      onClick={resetEditor}
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
