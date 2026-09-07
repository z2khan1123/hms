import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  SERVICE_DEPARTMENT_LABELS,
  createLabTestSchema,
  serviceDepartmentSchema,
  updateLabTestSchema,
  type LabTest,
  type Service,
  type ServiceDepartment,
} from '@hms/shared';
import { api } from '../lib/api';
import { useCan } from '../lib/permissions';
import { useDebounced } from '../lib/useDebounced';
import { blankToUndefined } from '../lib/format';
import { ErrorNote, Loading } from '../components/QueryFeedback';
import { SearchSelect } from '../components/SearchSelect';

const DEPARTMENTS = serviceDepartmentSchema.options;

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

interface ParamRow {
  key: string;
  name: string;
  unit: string;
  refLow: string;
  refHigh: string;
  refText: string;
}

const emptyParam = (): ParamRow => ({
  key: `p-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
  name: '',
  unit: '',
  refLow: '',
  refHigh: '',
  refText: '',
});

function toParamRows(test: LabTest): ParamRow[] {
  return test.parameters.map((p) => ({
    key: p.id,
    name: p.name,
    unit: p.unit ?? '',
    refLow: p.refLow != null ? String(p.refLow) : '',
    refHigh: p.refHigh != null ? String(p.refHigh) : '',
    refText: p.refText ?? '',
  }));
}

/** Build the `parameters` payload, preserving row order. */
function paramsPayload(rows: ParamRow[]) {
  return rows
    .filter((r) => r.name.trim())
    .map((r) => ({
      name: r.name.trim(),
      unit: blankToUndefined(r.unit),
      refLow: r.refLow.trim() ? Number(r.refLow) : undefined,
      refHigh: r.refHigh.trim() ? Number(r.refHigh) : undefined,
      refText: blankToUndefined(r.refText),
    }));
}

export function LabTestsPage() {
  const can = useCan();
  const canManage = can('labtest:manage');
  const queryClient = useQueryClient();

  const [q, setQ] = useState('');
  const debouncedQ = useDebounced(q);
  const [deptFilter, setDeptFilter] = useState<'' | ServiceDepartment>('');
  const [includeInactive, setIncludeInactive] = useState(true);

  const tests = useQuery({
    // LabTest[] for the catalogue — includeInactive varies the contents.
    queryKey: ['lab-tests', 'list', deptFilter, debouncedQ, includeInactive],
    queryFn: async () => {
      const { data } = await api.get<LabTest[]>('/lab-tests', {
        params: {
          department: deptFilter || undefined,
          q: debouncedQ || undefined,
          includeInactive: includeInactive || undefined,
        },
      });
      return data;
    },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['lab-tests'] });

  // --- editor (shared by create and edit) --------------------------------
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [department, setDepartment] = useState<'' | ServiceDepartment>('');
  const [linkedService, setLinkedService] = useState<{ id: string; name: string } | null>(
    null,
  );
  const [serviceQuery, setServiceQuery] = useState('');
  const debouncedService = useDebounced(serviceQuery);
  const [sampleType, setSampleType] = useState('');
  const [method, setMethod] = useState('');
  const [params, setParams] = useState<ParamRow[]>([]);
  const [issues, setIssues] = useState<string[]>([]);

  const serviceSearch = useQuery({
    queryKey: ['services', 'picker', department || 'any', debouncedService],
    queryFn: async () => {
      const { data } = await api.get<Service[]>('/services', {
        params: {
          department: department || undefined,
          q: debouncedService || undefined,
        },
      });
      return data;
    },
    enabled: canManage,
  });

  function resetEditor() {
    setEditingId(null);
    setName('');
    setDepartment('');
    setLinkedService(null);
    setServiceQuery('');
    setSampleType('');
    setMethod('');
    setParams([]);
    setIssues([]);
  }

  function startEdit(test: LabTest) {
    setEditingId(test.id);
    setName(test.name);
    setDepartment(test.department);
    setLinkedService(
      test.serviceId ? { id: test.serviceId, name: test.serviceName ?? 'Linked service' } : null,
    );
    setServiceQuery('');
    setSampleType(test.sampleType ?? '');
    setMethod(test.method ?? '');
    setParams(toParamRows(test));
    setIssues([]);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const save = useMutation({
    mutationFn: async () => {
      const common = {
        name: name.trim(),
        department: department || undefined,
        sampleType: blankToUndefined(sampleType),
        method: blankToUndefined(method),
        parameters: paramsPayload(params),
      };

      if (editingId) {
        const parsed = updateLabTestSchema.safeParse({
          ...common,
          // null clears the link, undefined would leave it.
          serviceId: linkedService ? linkedService.id : null,
          sampleType: blankToUndefined(sampleType) ?? null,
          method: blankToUndefined(method) ?? null,
        });
        if (!parsed.success) throw parsed.error;
        const { data } = await api.patch<LabTest>(`/lab-tests/${editingId}`, parsed.data);
        return data;
      }

      const parsed = createLabTestSchema.safeParse({
        ...common,
        serviceId: linkedService?.id,
      });
      if (!parsed.success) throw parsed.error;
      const { data } = await api.post<LabTest>('/lab-tests', parsed.data);
      return data;
    },
    onSuccess: async () => {
      resetEditor();
      await invalidate();
    },
    onError: (err: unknown) => {
      if (err && typeof err === 'object' && 'issues' in err) {
        setIssues(zodIssues(err as { issues: { path: (string | number)[]; message: string }[] }));
      }
    },
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setIssues([]);
    save.mutate();
  }

  const setParam = (key: string, patch: Partial<ParamRow>) =>
    setParams((prev) => prev.map((p) => (p.key === key ? { ...p, ...patch } : p)));

  const toggleActive = useMutation({
    mutationFn: async (test: LabTest) => {
      const { data } = await api.patch<LabTest>(`/lab-tests/${test.id}`, {
        isActive: !test.isActive,
      });
      return data;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/lab-tests/${id}`);
    },
    onSuccess: async () => {
      if (editingId) resetEditor();
      await invalidate();
    },
  });

  const rows = tests.data ?? [];

  return (
    <>
      <div className="page-head">
        <h1>Lab tests</h1>
      </div>

      <div className="split">
        <div className="card">
          <div className="section">
            <h2>Test catalogue</h2>
            <p className="muted">
              Each test names its department, the billable service it defines, its
              sample type and its reportable parameters. A test with no parameters
              is reported as narrative findings — normal for imaging.
            </p>
            <div className="toolbar">
              <input
                placeholder="Search tests"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Search tests"
              />
              <select
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value as '' | ServiceDepartment)}
                aria-label="Filter by department"
                style={{ maxWidth: 220 }}
              >
                <option value="">All departments</option>
                {DEPARTMENTS.map((d) => (
                  <option key={d} value={d}>
                    {SERVICE_DEPARTMENT_LABELS[d]}
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
                  checked={includeInactive}
                  onChange={(e) => setIncludeInactive(e.target.checked)}
                />
                Show inactive
              </label>
            </div>

            <ErrorNote error={tests.error} fallback="Could not load lab tests" />
            {tests.isPending && <Loading label="Loading tests…" />}

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Test</th>
                    <th>Department</th>
                    <th>Linked service</th>
                    <th>Sample</th>
                    <th className="num">Parameters</th>
                    <th>Active</th>
                    {canManage && <th className="no-print" />}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((t) => (
                    <tr key={t.id}>
                      <td>{t.name}</td>
                      <td>{SERVICE_DEPARTMENT_LABELS[t.department]}</td>
                      <td>{t.serviceName ?? <span className="muted">—</span>}</td>
                      <td>{t.sampleType ?? <span className="muted">—</span>}</td>
                      <td className="num">
                        {t.parameters.length > 0 ? (
                          t.parameters.length
                        ) : (
                          <span className="muted">Narrative</span>
                        )}
                      </td>
                      <td>{t.isActive ? 'Yes' : 'No'}</td>
                      {canManage && (
                        <td className="no-print">
                          <div className="row">
                            <button
                              type="button"
                              className="secondary"
                              onClick={() => startEdit(t)}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="secondary"
                              disabled={toggleActive.isPending}
                              onClick={() => toggleActive.mutate(t)}
                            >
                              {t.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                            <button
                              type="button"
                              className="danger"
                              disabled={remove.isPending}
                              onClick={() => remove.mutate(t.id)}
                            >
                              Delete
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                  {tests.data && rows.length === 0 && (
                    <tr>
                      <td colSpan={canManage ? 7 : 6} className="muted">
                        No tests defined.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <ErrorNote error={toggleActive.error} fallback="Could not update the test" />
            <ErrorNote error={remove.error} fallback="Could not delete the test" />
          </div>
        </div>

        {canManage && (
          <div className="card">
            <div className="section">
              <h2>{editingId ? 'Edit test' : 'New test'}</h2>
              <IssueList issues={issues} />
              <ErrorNote error={save.error} fallback="Could not save the test" />
              <form onSubmit={onSubmit} noValidate>
                <div className="field">
                  <label htmlFor="lt-name">Name</label>
                  <input
                    id="lt-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="lt-dept">Department</label>
                  <select
                    id="lt-dept"
                    value={department}
                    onChange={(e) =>
                      setDepartment(e.target.value as '' | ServiceDepartment)
                    }
                  >
                    <option value="">Select a department…</option>
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>
                        {SERVICE_DEPARTMENT_LABELS[d]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label>
                    Linked service <span className="muted">(optional)</span>
                  </label>
                  {linkedService ? (
                    <div className="picked">
                      <span className="picked-title">{linkedService.name}</span>
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setLinkedService(null)}
                      >
                        Clear
                      </button>
                    </div>
                  ) : (
                    <SearchSelect
                      placeholder="Search services…"
                      query={serviceQuery}
                      onQueryChange={setServiceQuery}
                      items={serviceSearch.data ?? []}
                      isLoading={serviceSearch.isFetching}
                      error={serviceSearch.error}
                      getKey={(s) => s.id}
                      renderItem={(s) => <div>{s.name}</div>}
                      onSelect={(s) => {
                        setLinkedService({ id: s.id, name: s.name });
                        setServiceQuery('');
                      }}
                      emptyLabel="No service matches"
                    />
                  )}
                  <span className="hint">
                    The billable service this test defines. One service has at most
                    one test definition.
                  </span>
                </div>

                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="lt-sample">
                      Sample type <span className="muted">(optional)</span>
                    </label>
                    <input
                      id="lt-sample"
                      value={sampleType}
                      onChange={(e) => setSampleType(e.target.value)}
                      placeholder="e.g. Whole blood (EDTA)"
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="lt-method">
                      Method <span className="muted">(optional)</span>
                    </label>
                    <input
                      id="lt-method"
                      value={method}
                      onChange={(e) => setMethod(e.target.value)}
                      placeholder="e.g. Automated cell counter"
                    />
                  </div>
                </div>

                <div className="field">
                  <label>Parameters</label>
                  <span className="hint">
                    Leave this empty for an imaging or narrative test — the result
                    screen will then ask for findings and an impression instead of
                    a value table. Rows are reported in the order shown here.
                  </span>
                  {params.length > 0 && (
                    <div className="table-wrap" style={{ marginTop: 8 }}>
                      <table>
                        <thead>
                          <tr>
                            <th>Name</th>
                            <th>Unit</th>
                            <th className="num">Ref low</th>
                            <th className="num">Ref high</th>
                            <th>Text reference</th>
                            <th className="no-print" />
                          </tr>
                        </thead>
                        <tbody>
                          {params.map((p, i) => (
                            <tr key={p.key}>
                              <td>
                                <input
                                  aria-label={`Parameter ${i + 1} name`}
                                  value={p.name}
                                  onChange={(e) => setParam(p.key, { name: e.target.value })}
                                />
                              </td>
                              <td>
                                <input
                                  aria-label={`Parameter ${i + 1} unit`}
                                  value={p.unit}
                                  onChange={(e) => setParam(p.key, { unit: e.target.value })}
                                />
                              </td>
                              <td className="num">
                                <input
                                  type="number"
                                  step="any"
                                  aria-label={`Parameter ${i + 1} reference low`}
                                  value={p.refLow}
                                  onChange={(e) => setParam(p.key, { refLow: e.target.value })}
                                />
                              </td>
                              <td className="num">
                                <input
                                  type="number"
                                  step="any"
                                  aria-label={`Parameter ${i + 1} reference high`}
                                  value={p.refHigh}
                                  onChange={(e) => setParam(p.key, { refHigh: e.target.value })}
                                />
                              </td>
                              <td>
                                <input
                                  aria-label={`Parameter ${i + 1} text reference`}
                                  value={p.refText}
                                  placeholder="e.g. Negative"
                                  onChange={(e) => setParam(p.key, { refText: e.target.value })}
                                />
                              </td>
                              <td className="no-print">
                                <button
                                  type="button"
                                  className="secondary"
                                  onClick={() =>
                                    setParams((prev) => prev.filter((x) => x.key !== p.key))
                                  }
                                >
                                  Remove
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <div className="row no-print" style={{ marginTop: 8 }}>
                    <button
                      type="button"
                      className="secondary"
                      onClick={() => setParams((prev) => [...prev, emptyParam()])}
                    >
                      Add parameter
                    </button>
                  </div>
                  <span className="hint">
                    Give a numeric range (low / high) to flag results automatically,
                    or a text reference such as “Negative”. Leave all three blank to
                    never flag the parameter.
                  </span>
                </div>

                <div className="row no-print" style={{ marginTop: 4 }}>
                  <button type="submit" disabled={save.isPending}>
                    {save.isPending
                      ? 'Saving…'
                      : editingId
                        ? 'Save changes'
                        : 'Create test'}
                  </button>
                  {editingId && (
                    <button type="button" className="secondary" onClick={resetEditor}>
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
