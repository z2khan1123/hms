import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AGGREGATION_LABELS,
  AGGREGATIONS_BY_KIND,
  DATE_GRAIN_LABELS,
  FILTER_OPERATOR_LABELS,
  OPERATORS_BY_KIND,
  createSavedViewSchema,
  dateGrainSchema,
  formatMoney,
  operatorTakesValue,
  toCsv,
  validateQuery,
  type Aggregation,
  type AnalyticsColumn,
  type AnalyticsFilter,
  type AnalyticsQuery,
  type AnalyticsResult,
  type Dataset,
  type DateGrain,
  type FilterOperator,
  type GroupBy,
  type Measure,
  type SavedView,
} from '@hms/shared';
import { api } from '../lib/api';
import { useCan } from '../lib/permissions';
import { blankToUndefined, formatDate, formatDateTime } from '../lib/format';
import { ErrorNote, Loading } from '../components/QueryFeedback';

const GRAINS = dateGrainSchema.options;

const inlineLabel = {
  display: 'inline-flex',
  gap: 6,
  alignItems: 'center',
  whiteSpace: 'nowrap',
} as const;

/**
 * One screen replacing 87 hardcoded report pages.
 *
 * The datasets, their fields and which aggregations apply to which kind of
 * field all come from the server's registry, so this page has no hardcoded
 * knowledge of the schema — adding a dataset there makes it appear here.
 */
export function AnalyticsPage() {
  const can = useCan();
  const queryClient = useQueryClient();

  const [datasetId, setDatasetId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [groupBy, setGroupBy] = useState<GroupBy[]>([]);
  const [measures, setMeasures] = useState<Measure[]>([]);
  const [filters, setFilters] = useState<AnalyticsFilter[]>([]);
  const [result, setResult] = useState<AnalyticsResult | null>(null);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const datasets = useQuery({
    queryKey: ['analytics', 'datasets'],
    queryFn: async () => {
      const { data } = await api.get<Dataset[]>('/analytics/datasets');
      return data;
    },
  });

  const dataset = (datasets.data ?? []).find((d) => d.id === datasetId) ?? null;
  const dimensions = dataset?.fields.filter((f) => f.role === 'dimension') ?? [];
  const fieldOf = (key: string) => dataset?.fields.find((f) => f.key === key);

  // Derived during render, never synced in an effect: switching dataset resets
  // everything that referred to the old one.
  const query: AnalyticsQuery | null =
    dataset && measures.length > 0
      ? {
          dataset: dataset.id,
          ...(from ? { from } : {}),
          ...(to ? { to } : {}),
          ...(groupBy.length ? { groupBy } : {}),
          measures,
          ...(filters.length ? { filters } : {}),
          limit: 1000,
        }
      : null;

  const problem = query && dataset ? validateQuery(query, dataset) : null;

  const run = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<AnalyticsResult>('/analytics/query', query);
      return data;
    },
    onSuccess: (data) => {
      setResult(data);
      setFormErr(null);
    },
  });

  const chooseDataset = (id: string) => {
    setDatasetId(id);
    setGroupBy([]);
    setMeasures([]);
    setFilters([]);
    setResult(null);
    setFormErr(null);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    if (!dataset) {
      setFormErr('Choose something to report on');
      return;
    }
    if (measures.length === 0) {
      setFormErr('Add at least one figure to measure');
      return;
    }
    if (problem) {
      setFormErr(problem);
      return;
    }
    run.mutate();
  };

  const loadView = (view: SavedView) => {
    setDatasetId(view.query.dataset);
    setFrom(view.query.from ?? '');
    setTo(view.query.to ?? '');
    setGroupBy(view.query.groupBy ?? []);
    setMeasures(view.query.measures);
    setFilters(view.query.filters ?? []);
    setResult(null);
    setFormErr(null);
  };

  const download = () => {
    if (!result) return;
    // Built from the same shared `toCsv` the server uses, so the file matches
    // the table exactly — and no second round trip is needed.
    const blob = new Blob([toCsv(result)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${dataset?.id ?? 'report'}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!can('analytics:read')) {
    return (
      <section>
        <h1>Reports</h1>
        <p className="muted">You do not have access to reports.</p>
      </section>
    );
  }

  return (
    <section>
      <h1>Reports</h1>
      <p className="muted">
        Pick what to report on, what to break it down by, and what to measure.
        Save anything worth asking again.
      </p>

      <ErrorNote error={datasets.error} fallback="Could not load the datasets" />
      {datasets.isPending && <Loading label="Loading datasets…" />}
      {datasets.data?.length === 0 && (
        <p className="muted">
          There is nothing you can report on — reports follow the same permissions
          as the data behind them.
        </p>
      )}

      {!!datasets.data?.length && (
        <form className="card" onSubmit={submit}>
          <label>
            Report on
            <select value={datasetId} onChange={(e) => chooseDataset(e.target.value)}>
              <option value="">Choose…</option>
              {datasets.data.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          {dataset && <p className="muted">{dataset.description}</p>}

          {dataset && (
            <>
              {dataset.dateField && (
                <div className="toolbar">
                  <label style={inlineLabel}>
                    From
                    <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                  </label>
                  <label style={inlineLabel}>
                    To
                    <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                  </label>
                  <span className="muted">
                    on {fieldOf(dataset.dateField)?.label.toLowerCase()}
                  </span>
                </div>
              )}

              <GroupByEditor
                dimensions={dimensions}
                value={groupBy}
                onChange={setGroupBy}
              />

              <MeasureEditor
                dataset={dataset}
                value={measures}
                onChange={setMeasures}
              />

              <FilterEditor dataset={dataset} value={filters} onChange={setFilters} />

              {problem && <div className="alert" role="alert">{problem}</div>}
              {formErr && <div className="alert" role="alert">{formErr}</div>}
              <ErrorNote error={run.error} fallback="Could not run this report" />

              <div className="actions">
                <button type="submit" disabled={run.isPending || !!problem}>
                  {run.isPending ? 'Running…' : 'Run report'}
                </button>
                {result && <button type="button" onClick={download}>Download CSV</button>}
                {query && !problem && (
                  <button type="button" onClick={() => setSaving((v) => !v)}>
                    {saving ? 'Cancel' : 'Save this view'}
                  </button>
                )}
              </div>
            </>
          )}
        </form>
      )}

      {saving && query && !problem && (
        <SaveViewForm
          query={query}
          onDone={async () => {
            setSaving(false);
            await queryClient.invalidateQueries({ queryKey: ['analytics', 'views'] });
          }}
        />
      )}

      {result && <ResultTable result={result} />}

      <SavedViews datasetId={datasetId || undefined} onLoad={loadView} />
    </section>
  );
}

// --- group by --------------------------------------------------------------

function GroupByEditor({
  dimensions,
  value,
  onChange,
}: {
  dimensions: Dataset['fields'];
  value: GroupBy[];
  onChange: (v: GroupBy[]) => void;
}) {
  return (
    <fieldset>
      <legend>Break down by</legend>
      <p className="muted">
        Leave empty for a single total across everything.
      </p>
      {value.map((g, i) => {
        const f = dimensions.find((d) => d.key === g.field);
        const isDate = f?.kind === 'date' || f?.kind === 'datetime';
        return (
          // eslint-disable-next-line react/no-array-index-key
          <div className="toolbar" key={i}>
            <select
              value={g.field}
              aria-label={`Break down by, level ${i + 1}`}
              onChange={(e) =>
                onChange(value.map((x, j) => (j === i ? { field: e.target.value } : x)))
              }
            >
              {dimensions.map((d) => (
                <option key={d.key} value={d.key}>{d.label}</option>
              ))}
            </select>
            {isDate && (
              <select
                value={g.grain ?? 'month'}
                aria-label={`Bucket level ${i + 1} by`}
                onChange={(e) =>
                  onChange(
                    value.map((x, j) =>
                      j === i ? { ...x, grain: e.target.value as DateGrain } : x,
                    ),
                  )
                }
              >
                {GRAINS.map((gr) => (
                  <option key={gr} value={gr}>{DATE_GRAIN_LABELS[gr]}</option>
                ))}
              </select>
            )}
            <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))}>
              Remove
            </button>
          </div>
        );
      })}
      {value.length < 3 && dimensions.length > 0 && (
        <button
          type="button"
          onClick={() => {
            const first = dimensions[0];
            const isDate = first.kind === 'date' || first.kind === 'datetime';
            onChange([...value, isDate ? { field: first.key, grain: 'month' } : { field: first.key }]);
          }}
        >
          Add a breakdown
        </button>
      )}
    </fieldset>
  );
}

// --- measures --------------------------------------------------------------

function MeasureEditor({
  dataset,
  value,
  onChange,
}: {
  dataset: Dataset;
  value: Measure[];
  onChange: (v: Measure[]) => void;
}) {
  const allowedAggs = (fieldKey: string) => {
    const f = dataset.fields.find((x) => x.key === fieldKey);
    return f ? AGGREGATIONS_BY_KIND[f.kind] : [];
  };

  return (
    <fieldset>
      <legend>Measure</legend>
      {value.length === 0 && (
        <p className="muted">Nothing measured yet — add at least one figure.</p>
      )}
      {value.map((m, i) => {
        const aggs = allowedAggs(m.field);
        return (
          // eslint-disable-next-line react/no-array-index-key
          <div className="toolbar" key={i}>
            <select
              value={m.agg}
              aria-label={`Measure ${i + 1} aggregation`}
              onChange={(e) =>
                onChange(
                  value.map((x, j) =>
                    j === i ? { ...x, agg: e.target.value as Aggregation } : x,
                  ),
                )
              }
            >
              {aggs.map((a) => (
                <option key={a} value={a}>{AGGREGATION_LABELS[a]}</option>
              ))}
            </select>
            <select
              value={m.field}
              aria-label={`Measure ${i + 1} field`}
              onChange={(e) => {
                const nextField = e.target.value;
                const next = allowedAggs(nextField);
                onChange(
                  value.map((x, j) =>
                    j === i
                      ? {
                          field: nextField,
                          // Keep the aggregation only if it still applies —
                          // "average" must not survive a move to a name field.
                          agg: next.includes(x.agg) ? x.agg : next[0],
                        }
                      : x,
                  ),
                );
              }}
            >
              {dataset.fields.map((f) => (
                <option key={f.key} value={f.key}>{f.label}</option>
              ))}
            </select>
            <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))}>
              Remove
            </button>
          </div>
        );
      })}
      {value.length < 10 && (
        <button
          type="button"
          onClick={() => {
            const f = dataset.fields[0];
            onChange([...value, { field: f.key, agg: AGGREGATIONS_BY_KIND[f.kind][0] }]);
          }}
        >
          Add a measure
        </button>
      )}
    </fieldset>
  );
}

// --- filters ---------------------------------------------------------------

function FilterEditor({
  dataset,
  value,
  onChange,
}: {
  dataset: Dataset;
  value: AnalyticsFilter[];
  onChange: (v: AnalyticsFilter[]) => void;
}) {
  const opsFor = (key: string) => {
    const f = dataset.fields.find((x) => x.key === key);
    return f ? OPERATORS_BY_KIND[f.kind] : [];
  };

  return (
    <fieldset>
      <legend>Only include</legend>
      {value.length === 0 && <p className="muted">No filters — everything is included.</p>}
      {value.map((flt, i) => {
        const f = dataset.fields.find((x) => x.key === flt.field);
        const ops = opsFor(flt.field);
        return (
          // eslint-disable-next-line react/no-array-index-key
          <div className="toolbar" key={i}>
            <select
              value={flt.field}
              aria-label={`Filter ${i + 1} field`}
              onChange={(e) => {
                const nextField = e.target.value;
                const nextOps = opsFor(nextField);
                onChange(
                  value.map((x, j) =>
                    j === i
                      ? {
                          field: nextField,
                          op: nextOps.includes(x.op) ? x.op : nextOps[0],
                          value: undefined,
                        }
                      : x,
                  ),
                );
              }}
            >
              {dataset.fields.map((d) => (
                <option key={d.key} value={d.key}>{d.label}</option>
              ))}
            </select>
            <select
              value={flt.op}
              aria-label={`Filter ${i + 1} operator`}
              onChange={(e) =>
                onChange(
                  value.map((x, j) =>
                    j === i ? { ...x, op: e.target.value as FilterOperator } : x,
                  ),
                )
              }
            >
              {ops.map((o) => (
                <option key={o} value={o}>{FILTER_OPERATOR_LABELS[o]}</option>
              ))}
            </select>
            {operatorTakesValue(flt.op) &&
              (f?.options ? (
                <select
                  value={String(flt.value ?? '')}
                  aria-label={`Filter ${i + 1} value`}
                  onChange={(e) =>
                    onChange(value.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))
                  }
                >
                  <option value="">Choose…</option>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              ) : (
                <input
                  value={String(flt.value ?? '')}
                  aria-label={`Filter ${i + 1} value`}
                  type={f?.kind === 'number' || f?.kind === 'money' ? 'number' : 'text'}
                  onChange={(e) => {
                    const raw = e.target.value;
                    const parsed =
                      f?.kind === 'number' || f?.kind === 'money'
                        ? raw === ''
                          ? undefined
                          : Number(raw)
                        : raw;
                    onChange(value.map((x, j) => (j === i ? { ...x, value: parsed } : x)));
                  }}
                />
              ))}
            <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))}>
              Remove
            </button>
          </div>
        );
      })}
      {value.length < 20 && (
        <button
          type="button"
          onClick={() =>
            onChange([
              ...value,
              { field: dataset.fields[0].key, op: opsFor(dataset.fields[0].key)[0] },
            ])
          }
        >
          Add a filter
        </button>
      )}
    </fieldset>
  );
}

// --- results ---------------------------------------------------------------

function cell(value: unknown, col: AnalyticsColumn): string {
  if (value === null || value === undefined) return '—';
  if (col.kind === 'money' && typeof value === 'number') return formatMoney(value);
  if (col.kind === 'date' && typeof value === 'string') return formatDate(value);
  if (col.kind === 'datetime' && typeof value === 'string') return formatDateTime(value);
  if (col.kind === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') {
    return Number.isInteger(value) ? String(value) : value.toFixed(2);
  }
  return String(value);
}

function ResultTable({ result }: { result: AnalyticsResult }) {
  if (result.rows.length === 0) {
    return (
      <div className="card">
        <p className="muted">
          No rows matched. Widen the dates or drop a filter.
        </p>
      </div>
    );
  }

  return (
    <div className="card">
      <p className="muted">
        {result.rows.length} row{result.rows.length === 1 ? '' : 's'} in {result.elapsedMs} ms
        {result.truncated && ' — more rows exist than are shown; narrow the report'}
      </p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {result.columns.map((c) => (
                <th key={c.key} className={c.role === 'measure' ? 'num' : undefined}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((row, i) => (
              // eslint-disable-next-line react/no-array-index-key
              <tr key={i}>
                {result.columns.map((c) => (
                  <td key={c.key} className={c.role === 'measure' ? 'num' : undefined}>
                    {cell(row[c.key], c)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- saved views -----------------------------------------------------------

function SaveViewForm({
  query,
  onDone,
}: {
  query: AnalyticsQuery;
  onDone: () => Promise<void>;
}) {
  const can = useCan();
  const [form, setForm] = useState({ name: '', description: '', isShared: false });
  const [formErr, setFormErr] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const body = createSavedViewSchema.parse({
        name: form.name,
        description: blankToUndefined(form.description),
        query,
        isShared: form.isShared,
      });
      const { data } = await api.post<SavedView>('/analytics/views', body);
      return data;
    },
    onSuccess: onDone,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    const parsed = createSavedViewSchema.safeParse({
      name: form.name,
      description: blankToUndefined(form.description),
      query,
      isShared: form.isShared,
    });
    if (!parsed.success) {
      setFormErr(parsed.error.issues[0]?.message ?? 'Check the values');
      return;
    }
    save.mutate();
  };

  return (
    <form className="card" onSubmit={submit}>
      <h2>Save this view</h2>
      <div className="toolbar">
        <label style={inlineLabel}>
          Name
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
        </label>
        <label style={inlineLabel}>
          Description
          <input
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </label>
        {can('analytics:share') && (
          <label style={inlineLabel}>
            <input
              type="checkbox"
              checked={form.isShared}
              onChange={(e) => setForm((f) => ({ ...f, isShared: e.target.checked }))}
            />
            Share with everyone who can see this data
          </label>
        )}
        <button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
      {formErr && <div className="alert" role="alert">{formErr}</div>}
      <ErrorNote error={save.error} fallback="Could not save this view" />
    </form>
  );
}

function SavedViews({
  datasetId,
  onLoad,
}: {
  datasetId?: string;
  onLoad: (view: SavedView) => void;
}) {
  const queryClient = useQueryClient();

  const views = useQuery({
    queryKey: ['analytics', 'views', datasetId ?? 'all'],
    queryFn: async () => {
      const { data } = await api.get<SavedView[]>('/analytics/views', {
        params: datasetId ? { dataset: datasetId } : {},
      });
      return data;
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/analytics/views/${id}`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['analytics', 'views'] });
    },
  });

  return (
    <div className="card">
      <h2>Saved views</h2>
      <ErrorNote error={views.error} fallback="Could not load saved views" />
      <ErrorNote error={remove.error} fallback="Could not delete that view" />
      {views.isPending && <Loading label="Loading saved views…" />}
      {views.data?.length === 0 && (
        <p className="muted">
          Nothing saved yet. Build a report above and use “Save this view”.
        </p>
      )}
      {!!views.data?.length && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Description</th>
                <th>Saved by</th>
                <th>Shared</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {views.data.map((v) => (
                <tr key={v.id}>
                  <td>{v.name}</td>
                  <td>{v.description ?? '—'}</td>
                  <td>{v.isMine ? 'You' : (v.createdBy ?? '—')}</td>
                  <td>{v.isShared ? 'Yes' : 'No'}</td>
                  <td>
                    <span className="actions">
                      <button type="button" onClick={() => onLoad(v)}>Open</button>
                      {v.isMine && (
                        <button
                          type="button"
                          disabled={remove.isPending}
                          onClick={() => remove.mutate(v.id)}
                        >
                          Delete
                        </button>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
