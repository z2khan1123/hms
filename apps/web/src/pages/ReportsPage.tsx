import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  SERVICE_DEPARTMENT_LABELS,
  serviceDepartmentSchema,
  type DiagnosticReport,
  type ServiceDepartment,
} from '@hms/shared';
import { api } from '../lib/api';
import { useDebounced } from '../lib/useDebounced';
import { formatDateTime } from '../lib/format';
import { ErrorNote, Loading } from '../components/QueryFeedback';
import { StatusBadge } from '../components/StatusBadge';

const DEPARTMENTS = serviceDepartmentSchema.options;

export function ReportsPage() {
  const [q, setQ] = useState('');
  const debouncedQ = useDebounced(q);
  const [dept, setDept] = useState<'' | ServiceDepartment>('');
  const [pendingOnly, setPendingOnly] = useState(true);

  const reports = useQuery({
    // DiagnosticReport[] worklist — pendingOnly and dept vary the contents.
    queryKey: ['reports', 'list', dept, pendingOnly, debouncedQ],
    queryFn: async () => {
      const { data } = await api.get<DiagnosticReport[]>('/reports', {
        params: {
          department: dept || undefined,
          pendingOnly: pendingOnly || undefined,
          q: debouncedQ || undefined,
        },
      });
      return data;
    },
    placeholderData: keepPreviousData,
  });

  const rows = reports.data ?? [];

  return (
    <>
      <div className="page-head">
        <h1>Reports</h1>
        <Link to="/worklist">Department worklist</Link>
      </div>

      <div className="toolbar">
        <input
          placeholder="Search by patient or test"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search reports"
        />
        <select
          value={dept}
          onChange={(e) => setDept(e.target.value as '' | ServiceDepartment)}
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
            checked={pendingOnly}
            onChange={(e) => setPendingOnly(e.target.checked)}
          />
          Pending only
        </label>
      </div>

      <ErrorNote error={reports.error} fallback="Could not load reports" />
      {reports.isPending && <Loading label="Loading reports…" />}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Patient</th>
              <th>Test</th>
              <th>Department</th>
              <th>Sample collected</th>
              <th>Status</th>
              <th>Reported by</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const to = r.isFinal
                ? `/reports/${r.id}`
                : `/reports/order/${r.serviceOrderId}`;
              return (
                <tr key={r.id}>
                  <td>
                    <Link to={to}>
                      {r.patient.lastName}, {r.patient.firstName}
                    </Link>
                    <div className="muted">{r.patient.mrn}</div>
                  </td>
                  <td>{r.serviceName}</td>
                  <td>{SERVICE_DEPARTMENT_LABELS[r.department]}</td>
                  <td>
                    {r.sampleCollectedAt ? (
                      formatDateTime(r.sampleCollectedAt)
                    ) : (
                      <span className="muted">—</span>
                    )}
                  </td>
                  <td>
                    <StatusBadge
                      status={r.isFinal ? 'final' : 'draft'}
                      label={r.isFinal ? 'Final' : 'Draft'}
                    />
                  </td>
                  <td>{r.reportedBy ?? <span className="muted">—</span>}</td>
                </tr>
              );
            })}
            {reports.data && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  {pendingOnly
                    ? 'No pending reports. Clear "Pending only" to see finalised reports.'
                    : 'No reports found.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
