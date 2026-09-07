import { useState } from 'react';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import {
  BILL_ITEM_STATUS_LABELS,
  SERVICE_ORDER_STATUS_LABELS,
  collectSampleSchema,
  setServiceOrderStatusSchema,
  type ServiceOrder,
  type ServiceOrderStatus,
} from '@hms/shared';
import { api, apiErrorMessage } from '../lib/api';
import { useCan } from '../lib/permissions';
import { formatDateTime } from '../lib/format';
import { ErrorNote, Loading } from '../components/QueryFeedback';
import { StatusBadge } from '../components/StatusBadge';

type DeptFilter = '' | 'laboratory' | 'radiology';

const NOT_RELEASABLE_HINT = 'Not paid. Send the patient to the billing counter.';

const DEPARTMENTS = [
  { value: '', label: 'All departments' },
  { value: 'laboratory', label: 'Laboratory' },
  { value: 'radiology', label: 'Radiology' },
] as const satisfies readonly { value: DeptFilter; label: string }[];

function paymentLabel(o: ServiceOrder): string {
  if (o.approvedWithoutPayment) return 'Approved without payment';
  if (o.billStatus) return BILL_ITEM_STATUS_LABELS[o.billStatus];
  return 'No charge';
}

export function DepartmentWorklistPage() {
  const can = useCan();
  const queryClient = useQueryClient();
  const canUpdate = can('order:update');
  const canReadReports = can('report:read');

  const [dept, setDept] = useState<DeptFilter>('');
  const [showBlocked, setShowBlocked] = useState(false);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  const orders = useQuery({
    queryKey: ['orders', 'worklist', dept || 'all', showBlocked],
    queryFn: async () => {
      const { data } = await api.get<ServiceOrder[]>('/orders', {
        params: {
          department: dept || undefined,
          releasableOnly: showBlocked ? undefined : true,
        },
      });
      return data;
    },
    placeholderData: keepPreviousData,
  });

  const setStatus = useMutation({
    mutationFn: async (input: { id: string; status: ServiceOrderStatus }) => {
      const parsed = setServiceOrderStatusSchema.safeParse({ status: input.status });
      if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message ?? 'Invalid status change');
      }
      const { data } = await api.patch<ServiceOrder>(
        `/orders/${input.id}/status`,
        parsed.data,
      );
      return data;
    },
    onMutate: () => setRowError(null),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      await queryClient.invalidateQueries({ queryKey: ['opd', 'list'] });
    },
    onError: (err, vars) =>
      setRowError({
        id: vars.id,
        // The API also enforces the paid/approved rule — surface its 409 message.
        message: apiErrorMessage(err, 'Could not update the order'),
      }),
  });

  const collectSample = useMutation({
    mutationFn: async (input: { id: string }) => {
      const body = collectSampleSchema.parse({});
      const { data } = await api.post<ServiceOrder>(
        `/orders/${input.id}/collect-sample`,
        body,
      );
      return data;
    },
    onMutate: () => setRowError(null),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['orders'] });
      await queryClient.invalidateQueries({ queryKey: ['opd', 'list'] });
    },
    onError: (err, vars) =>
      setRowError({
        id: vars.id,
        message: apiErrorMessage(err, 'Could not collect the sample'),
      }),
  });

  const busy = setStatus.isPending || collectSample.isPending;
  const rows = orders.data ?? [];

  return (
    <>
      <div className="page-head">
        <h1>Department worklist</h1>
        <Link to="/opd">OPD list</Link>
      </div>

      <div className="toolbar">
        <select
          value={dept}
          onChange={(e) => setDept(e.target.value as DeptFilter)}
          aria-label="Department"
          style={{ maxWidth: 240 }}
        >
          {DEPARTMENTS.map((d) => (
            <option key={d.value} value={d.value}>
              {d.label}
            </option>
          ))}
        </select>
        <label className="row" style={{ gap: 6 }}>
          <input
            type="checkbox"
            checked={showBlocked}
            onChange={(e) => setShowBlocked(e.target.checked)}
          />
          Show blocked (unpaid) orders
        </label>
      </div>

      <ErrorNote error={orders.error} fallback="Could not load the worklist" />
      {orders.isPending && <Loading label="Loading worklist…" />}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Patient</th>
              <th>Service</th>
              <th>Ordered</th>
              <th>Order status</th>
              <th>Payment</th>
              <th className="no-print" />
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => {
              const blocked = !o.releasable;
              const showCollect = o.status === 'ordered';
              const showStart =
                o.status === 'ordered' || o.status === 'sample_collected';
              const showComplete = o.status === 'in_progress';
              const showResult = canReadReports && o.releasable && o.status !== 'cancelled';
              return (
                <tr key={o.id}>
                  <td>
                    {o.patient.lastName}, {o.patient.firstName}
                    <div className="muted">{o.patient.mrn}</div>
                  </td>
                  <td>
                    {o.serviceName}
                    {o.note ? <div className="muted">{o.note}</div> : null}
                  </td>
                  <td>{formatDateTime(o.orderedAt)}</td>
                  <td>
                    <StatusBadge
                      status={o.status}
                      label={SERVICE_ORDER_STATUS_LABELS[o.status]}
                    />
                  </td>
                  <td>
                    {blocked ? (
                      <span className="badge badge-ordered">{paymentLabel(o)}</span>
                    ) : (
                      <span className="badge badge-paid">{paymentLabel(o)}</span>
                    )}
                  </td>
                  <td className="no-print">
                    {!canUpdate && !showResult && <span className="muted">—</span>}
                    <div className="row">
                      {canUpdate && showCollect && (
                        <button
                          type="button"
                          className="secondary"
                          disabled={blocked || busy}
                          onClick={() => collectSample.mutate({ id: o.id })}
                        >
                          Collect sample
                        </button>
                      )}
                      {canUpdate && showStart && (
                        <button
                          type="button"
                          disabled={blocked || busy}
                          onClick={() =>
                            setStatus.mutate({ id: o.id, status: 'in_progress' })
                          }
                        >
                          Start
                        </button>
                      )}
                      {canUpdate && showComplete && (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            setStatus.mutate({ id: o.id, status: 'completed' })
                          }
                        >
                          Complete
                        </button>
                      )}
                      {showResult && (
                        <Link to={`/reports/order/${o.id}`}>Enter result</Link>
                      )}
                    </div>
                    {canUpdate && (showCollect || showStart) && blocked && (
                      <span className="blocked-note">{NOT_RELEASABLE_HINT}</span>
                    )}
                    {rowError?.id === o.id && (
                      <span className="blocked-note">{rowError.message}</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {orders.data && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  {showBlocked
                    ? 'No orders for this department.'
                    : 'No released orders. Toggle "Show blocked" to see orders still awaiting payment.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
