import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  SERVICE_DEPARTMENT_LABELS,
  createServiceSchema,
  formatMoney,
  serviceDepartmentSchema,
  toMajor,
  toMinor,
  updateServiceSchema,
  type Service,
  type ServiceDepartment,
} from '@hms/shared';
import { api } from '../lib/api';
import { useCan } from '../lib/permissions';
import { num } from '../lib/bill-line';
import { blankToUndefined } from '../lib/format';
import { ErrorNote, Loading } from '../components/QueryFeedback';

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

export function ServicesPage() {
  const can = useCan();
  const canManage = can('service:manage');
  const queryClient = useQueryClient();

  const [q, setQ] = useState('');
  const [deptFilter, setDeptFilter] = useState<'' | ServiceDepartment>('');
  const [includeInactive, setIncludeInactive] = useState(true);

  const services = useQuery({
    // Service[] for the setup list — includeInactive varies the shape's contents.
    queryKey: ['services', 'list', deptFilter, q, includeInactive],
    queryFn: async () => {
      const { data } = await api.get<Service[]>('/services', {
        params: {
          department: deptFilter || undefined,
          q: q || undefined,
          includeInactive: includeInactive || undefined,
        },
      });
      return data;
    },
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['services'] });

  // --- create ------------------------------------------------------------
  const [name, setName] = useState('');
  const [department, setDepartment] = useState<'' | ServiceDepartment>('');
  const [priceMajor, setPriceMajor] = useState('');
  const [description, setDescription] = useState('');
  const [issues, setIssues] = useState<string[]>([]);

  const create = useMutation({
    mutationFn: async (payload: unknown) => {
      const { data } = await api.post<Service>('/services', payload);
      return data;
    },
    onSuccess: async () => {
      setName('');
      setDepartment('');
      setPriceMajor('');
      setDescription('');
      setIssues([]);
      await invalidate();
    },
  });

  function onCreate(event: FormEvent) {
    event.preventDefault();
    setIssues([]);
    const parsed = createServiceSchema.safeParse({
      name: name.trim(),
      department: department || undefined,
      defaultPriceMinor: priceMajor.trim() ? toMinor(num(priceMajor)) : undefined,
      description: blankToUndefined(description),
    });
    if (!parsed.success) {
      setIssues(zodIssues(parsed.error));
      return;
    }
    create.mutate(parsed.data);
  }

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: unknown }) => {
      const { data } = await api.patch<Service>(`/services/${id}`, patch);
      return data;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/services/${id}`);
    },
    onSuccess: invalidate,
  });

  const rowBusy = update.isPending || remove.isPending;

  return (
    <>
      <div className="page-head">
        <h1>Services</h1>
      </div>

      <div className="split">
        <div className="card">
          <div className="section">
            <h2>Service list</h2>
            <p className="muted">
              The names you can bill. A suggested price only pre-fills the
              patient’s bill — the price charged is always what is typed on their
              file.
            </p>
            <div className="toolbar">
              <input
                placeholder="Search services"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Search services"
              />
              <select
                value={deptFilter}
                onChange={(e) =>
                  setDeptFilter(e.target.value as '' | ServiceDepartment)
                }
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

            <ErrorNote error={services.error} fallback="Could not load services" />
            {services.isPending && <Loading />}

            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Department</th>
                    <th className="num">Suggested price</th>
                    <th>Active</th>
                    {canManage && <th />}
                  </tr>
                </thead>
                <tbody>
                  {services.data?.map((s) => (
                    <ServiceRow
                      key={s.id}
                      service={s}
                      canManage={canManage}
                      busy={rowBusy}
                      onSave={(patch) => update.mutate({ id: s.id, patch })}
                      onDelete={() => remove.mutate(s.id)}
                    />
                  ))}
                  {services.data && services.data.length === 0 && (
                    <tr>
                      <td colSpan={canManage ? 5 : 4} className="muted">
                        No services defined.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <ErrorNote error={update.error} fallback="Could not update the service" />
            <ErrorNote error={remove.error} fallback="Could not delete the service" />
          </div>
        </div>

        {canManage && (
          <div className="card">
            <div className="section">
              <h2>New service</h2>
              <IssueList issues={issues} />
              <ErrorNote error={create.error} fallback="Could not create the service" />
              <form onSubmit={onCreate} noValidate>
                <div className="field">
                  <label htmlFor="svc-name">Name</label>
                  <input
                    id="svc-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="svc-dept">
                    Department <span className="muted">(optional)</span>
                  </label>
                  <select
                    id="svc-dept"
                    value={department}
                    onChange={(e) =>
                      setDepartment(e.target.value as '' | ServiceDepartment)
                    }
                  >
                    <option value="">—</option>
                    {DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>
                        {SERVICE_DEPARTMENT_LABELS[d]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="svc-price">
                    Suggested price (PKR) <span className="muted">(optional)</span>
                  </label>
                  <input
                    id="svc-price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={priceMajor}
                    onChange={(e) => setPriceMajor(e.target.value)}
                  />
                  <span className="hint">
                    A suggestion only — it pre-fills the bill and is fully
                    editable on the patient’s file.
                  </span>
                </div>
                <div className="field">
                  <label htmlFor="svc-desc">
                    Description <span className="muted">(optional)</span>
                  </label>
                  <textarea
                    id="svc-desc"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
                <button type="submit" disabled={create.isPending}>
                  {create.isPending ? 'Creating…' : 'Create service'}
                </button>
              </form>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function ServiceRow({
  service,
  canManage,
  busy,
  onSave,
  onDelete,
}: {
  service: Service;
  canManage: boolean;
  busy: boolean;
  onSave: (patch: unknown) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(service.name);
  const [department, setDepartment] = useState<'' | ServiceDepartment>(
    service.department ?? '',
  );
  const [priceMajor, setPriceMajor] = useState(
    service.defaultPriceMinor != null
      ? String(toMajor(service.defaultPriceMinor))
      : '',
  );
  const [issue, setIssue] = useState<string | null>(null);

  function startEditing() {
    setName(service.name);
    setDepartment(service.department ?? '');
    setPriceMajor(
      service.defaultPriceMinor != null
        ? String(toMajor(service.defaultPriceMinor))
        : '',
    );
    setIssue(null);
    setEditing(true);
  }

  function save() {
    const parsed = updateServiceSchema.safeParse({
      name: name.trim(),
      department: department || undefined,
      defaultPriceMinor: priceMajor.trim()
        ? toMinor(num(priceMajor))
        : undefined,
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
        <td>
          {service.name}
          {service.description ? (
            <div className="muted">{service.description}</div>
          ) : null}
        </td>
        <td>
          {service.department
            ? SERVICE_DEPARTMENT_LABELS[service.department]
            : '—'}
        </td>
        <td className="num">
          {service.defaultPriceMinor != null
            ? formatMoney(service.defaultPriceMinor)
            : '—'}
        </td>
        <td>{service.isActive ? 'Yes' : 'No'}</td>
        {canManage && (
          <td>
            <div className="row">
              <button type="button" className="secondary" onClick={startEditing}>
                Edit
              </button>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => onSave({ isActive: !service.isActive })}
              >
                {service.isActive ? 'Deactivate' : 'Activate'}
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
          aria-label="Service name"
        />
        {issue && <div className="hint">{issue}</div>}
      </td>
      <td>
        <select
          value={department}
          onChange={(e) =>
            setDepartment(e.target.value as '' | ServiceDepartment)
          }
          aria-label="Department"
        >
          <option value="">—</option>
          {DEPARTMENTS.map((d) => (
            <option key={d} value={d}>
              {SERVICE_DEPARTMENT_LABELS[d]}
            </option>
          ))}
        </select>
      </td>
      <td className="num">
        <input
          type="number"
          min="0"
          step="0.01"
          value={priceMajor}
          onChange={(e) => setPriceMajor(e.target.value)}
          aria-label="Suggested price"
        />
      </td>
      <td>{service.isActive ? 'Yes' : 'No'}</td>
      <td>
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
