import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ATTENDANCE_STATUS_LABELS,
  LEAVE_STATUS_LABELS,
  PAYROLL_STATUS_LABELS,
  ROLE_LABELS,
  ROLES,
  applyLeaveSchema,
  assignRosterSchema,
  attendanceStatusSchema,
  computePayslip,
  createHrNamedSchema,
  createLeaveTypeSchema,
  createPayrollRunSchema,
  createShiftSchema,
  createStaffSchema,
  decideLeaveSchema,
  formatMoney,
  leaveDaysBetween,
  leaveRequestStatusSchema,
  toMinor,
  updatePayslipSchema,
  updateStaffSchema,
  type ApplyLeaveInput,
  type Attendance,
  type AttendanceStatus,
  type CreateStaffInput,
  type HrNamed,
  type LeaveBalance,
  type LeaveRequest,
  type LeaveRequestStatus,
  type LeaveType,
  type PayrollRun,
  type Payslip,
  type RosterEntry,
  type Shift,
  type Staff,
  type UpdateStaffInput,
} from '@hms/shared';
import { api } from '../lib/api';
import { useCan } from '../lib/permissions';
import { num } from '../lib/bill-line';
import { blankToUndefined, formatDate, todayIsoDate } from '../lib/format';
import { ErrorNote, Loading } from '../components/QueryFeedback';
import { StatusBadge } from '../components/StatusBadge';
import { Tabs, type TabDef } from '../components/Tabs';
import { useDebounced } from '../lib/useDebounced';

type TabValue = 'staff' | 'attendance' | 'leave' | 'roster' | 'payroll' | 'setup';

const TABS: readonly TabDef<TabValue>[] = [
  { value: 'staff', label: 'Staff' },
  { value: 'attendance', label: 'Attendance' },
  { value: 'leave', label: 'Leave' },
  { value: 'roster', label: 'Roster' },
  { value: 'payroll', label: 'Payroll' },
  { value: 'setup', label: 'Setup' },
];

const ATTENDANCE_STATUSES = attendanceStatusSchema.options;
const LEAVE_STATUSES = leaveRequestStatusSchema.options;

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

/** Rupees typed into a field -> paisa. Never `parseFloat` money by hand. */
function minorOf(major: string): number {
  return Math.max(0, toMinor(num(major)));
}

/** YYYY-MM-DD, n days from a given date. */
function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function HrPage() {
  const [tab, setTab] = useState<TabValue>('staff');
  const can = useCan();

  return (
    <section>
      <h1>Staff</h1>
      <Tabs tabs={TABS} value={tab} onChange={setTab} ariaLabel="HR sections" />

      {tab === 'staff' && <StaffTab />}
      {tab === 'attendance' && <AttendanceTab />}
      {tab === 'leave' && <LeaveTab />}
      {tab === 'roster' && <RosterTab />}
      {tab === 'payroll' && can('payroll:read') && <PayrollTab />}
      {tab === 'payroll' && !can('payroll:read') && (
        <p className="muted">You do not have access to payroll.</p>
      )}
      {tab === 'setup' && <SetupTab />}
    </section>
  );
}

// --- shared lookups --------------------------------------------------------

function useDepartments() {
  return useQuery({
    queryKey: ['hr', 'departments', 'list'],
    queryFn: async () => {
      const { data } = await api.get<HrNamed[]>('/hr/departments');
      return data;
    },
  });
}

function useDesignations() {
  return useQuery({
    queryKey: ['hr', 'designations', 'list'],
    queryFn: async () => {
      const { data } = await api.get<HrNamed[]>('/hr/designations');
      return data;
    },
  });
}

function useStaffLookup() {
  return useQuery({
    queryKey: ['hr', 'staff', 'lookup'],
    queryFn: async () => {
      const { data } = await api.get<Staff[]>('/hr/staff');
      return data;
    },
  });
}

function staffLabel(s: Staff): string {
  return `${s.staffNo} — ${s.firstName} ${s.lastName}`;
}

// --- staff -----------------------------------------------------------------

function StaffTab() {
  const can = useCan();
  const queryClient = useQueryClient();
  const canManage = can('staff:manage');

  const [q, setQ] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [includeInactive, setIncludeInactive] = useState(false);
  const [editing, setEditing] = useState<Staff | null>(null);
  const [adding, setAdding] = useState(false);
  const debouncedQ = useDebounced(q, 300);

  const departments = useDepartments();

  const list = useQuery({
    queryKey: ['hr', 'staff', 'list', debouncedQ, departmentId, includeInactive],
    queryFn: async () => {
      const { data } = await api.get<Staff[]>('/hr/staff', {
        params: {
          ...(debouncedQ ? { q: debouncedQ } : {}),
          ...(departmentId ? { departmentId } : {}),
          ...(includeInactive ? { includeInactive: 'true' } : {}),
        },
      });
      return data;
    },
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['hr', 'staff'] });
  };

  return (
    <div>
      <div className="toolbar">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, staff number or email"
          aria-label="Search staff"
        />
        <select
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
          aria-label="Department"
        >
          <option value="">All departments</option>
          {(departments.data ?? []).map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <label style={inlineLabel}>
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
          />
          Show former staff
        </label>
        {canManage && (
          <button type="button" onClick={() => { setAdding(true); setEditing(null); }}>
            Add staff
          </button>
        )}
      </div>

      {adding && canManage && (
        <StaffForm
          onDone={async () => {
            setAdding(false);
            await invalidate();
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      {editing && canManage && (
        <StaffEditForm
          staff={editing}
          onDone={async () => {
            setEditing(null);
            await invalidate();
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      <ErrorNote error={list.error} fallback="Could not load staff" />
      {list.isPending && <Loading label="Loading staff…" />}
      {list.data?.length === 0 && (
        <p className="muted">
          No staff match this filter. {canManage && 'Use “Add staff” to create the first record.'}
        </p>
      )}

      {!!list.data?.length && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Staff no.</th>
                <th>Name</th>
                <th>Role</th>
                <th>Department</th>
                <th>Designation</th>
                <th>Joined</th>
                <th className="num">Basic</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.data.map((s) => (
                <tr key={s.id}>
                  <td>{s.staffNo}</td>
                  <td>
                    {s.firstName} {s.lastName}
                    {!s.isActive && ' '}
                    {!s.isActive && <StatusBadge status="inactive" label="Former" />}
                  </td>
                  <td>{ROLE_LABELS[s.role]}</td>
                  <td>{s.department?.name ?? '—'}</td>
                  <td>{s.designation?.name ?? '—'}</td>
                  <td>{formatDate(s.joinedOn)}</td>
                  <td className="num">
                    {s.basicSalaryMinor === null ? '—' : formatMoney(s.basicSalaryMinor)}
                  </td>
                  <td>
                    {canManage && (
                      <button
                        type="button"
                        onClick={() => { setEditing(s); setAdding(false); }}
                      >
                        Edit
                      </button>
                    )}
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

function StaffForm({
  onDone,
  onCancel,
}: {
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const departments = useDepartments();
  const designations = useDesignations();
  const [formErr, setFormErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    role: 'nurse' as CreateStaffInput['role'],
    departmentId: '',
    designationId: '',
    phone: '',
    emergencyPhone: '',
    address: '',
    nationalId: '',
    joinedOn: todayIsoDate(),
    basicSalaryMajor: '',
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const create = useMutation({
    mutationFn: async (payload: CreateStaffInput) => {
      const { data } = await api.post<Staff>('/hr/staff', payload);
      return data;
    },
    onSuccess: onDone,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    const parsed = createStaffSchema.safeParse({
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email,
      password: form.password,
      role: form.role,
      departmentId: blankToUndefined(form.departmentId),
      designationId: blankToUndefined(form.designationId),
      phone: blankToUndefined(form.phone),
      emergencyPhone: blankToUndefined(form.emergencyPhone),
      address: blankToUndefined(form.address),
      nationalId: blankToUndefined(form.nationalId),
      joinedOn: form.joinedOn,
      ...(form.basicSalaryMajor
        ? { basicSalaryMinor: minorOf(form.basicSalaryMajor) }
        : {}),
    });
    if (!parsed.success) {
      setFormErr(zodMessage(parsed.error));
      return;
    }
    create.mutate(parsed.data);
  };

  return (
    <form className="card" onSubmit={submit}>
      <h2>Add staff</h2>
      <p className="muted">
        This creates a login as well as the employment record. The staff number is
        issued automatically.
      </p>

      <div className="grid">
        <label>
          First name
          <input value={form.firstName} onChange={(e) => set('firstName', e.target.value)} required />
        </label>
        <label>
          Last name
          <input value={form.lastName} onChange={(e) => set('lastName', e.target.value)} required />
        </label>
        <label>
          Email (their login)
          <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} required />
        </label>
        <label>
          Initial password
          <input
            type="password"
            value={form.password}
            onChange={(e) => set('password', e.target.value)}
            minLength={12}
            required
          />
        </label>
        <label>
          Role
          <select value={form.role} onChange={(e) => set('role', e.target.value as CreateStaffInput['role'])}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Department
          <select value={form.departmentId} onChange={(e) => set('departmentId', e.target.value)}>
            <option value="">—</option>
            {(departments.data ?? []).map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </label>
        <label>
          Designation
          <select value={form.designationId} onChange={(e) => set('designationId', e.target.value)}>
            <option value="">—</option>
            {(designations.data ?? []).map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </label>
        <label>
          Phone
          <input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        </label>
        <label>
          Emergency phone
          <input value={form.emergencyPhone} onChange={(e) => set('emergencyPhone', e.target.value)} />
        </label>
        <label>
          CNIC
          <input
            value={form.nationalId}
            onChange={(e) => set('nationalId', e.target.value)}
            placeholder="35202-1234567-1"
          />
        </label>
        <label>
          Joined on
          <input type="date" value={form.joinedOn} onChange={(e) => set('joinedOn', e.target.value)} required />
        </label>
        <label>
          Monthly basic pay
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.basicSalaryMajor}
            onChange={(e) => set('basicSalaryMajor', e.target.value)}
          />
        </label>
      </div>

      <label>
        Address
        <textarea value={form.address} onChange={(e) => set('address', e.target.value)} rows={2} />
      </label>

      {formErr && <div className="alert" role="alert">{formErr}</div>}
      <ErrorNote error={create.error} fallback="Could not add this staff member" />

      <div className="actions">
        <button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Saving…' : 'Add staff'}
        </button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

function StaffEditForm({
  staff,
  onDone,
  onCancel,
}: {
  staff: Staff;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const departments = useDepartments();
  const designations = useDesignations();
  const [formErr, setFormErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    firstName: staff.firstName,
    lastName: staff.lastName,
    role: staff.role,
    departmentId: staff.department?.id ?? '',
    designationId: staff.designation?.id ?? '',
    phone: staff.phone ?? '',
    emergencyPhone: staff.emergencyPhone ?? '',
    address: staff.address ?? '',
    joinedOn: staff.joinedOn,
    leftOn: staff.leftOn ?? '',
    basicSalaryMajor:
      staff.basicSalaryMinor === null ? '' : String(staff.basicSalaryMinor / 100),
    isActive: staff.isActive,
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const update = useMutation({
    mutationFn: async (payload: UpdateStaffInput) => {
      const { data } = await api.patch<Staff>(`/hr/staff/${staff.id}`, payload);
      return data;
    },
    onSuccess: onDone,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    const parsed = updateStaffSchema.safeParse({
      firstName: form.firstName,
      lastName: form.lastName,
      role: form.role,
      departmentId: form.departmentId || null,
      designationId: form.designationId || null,
      phone: form.phone || null,
      emergencyPhone: form.emergencyPhone || null,
      address: form.address || null,
      joinedOn: form.joinedOn,
      leftOn: form.leftOn || null,
      basicSalaryMinor: form.basicSalaryMajor ? minorOf(form.basicSalaryMajor) : null,
      isActive: form.isActive,
    });
    if (!parsed.success) {
      setFormErr(zodMessage(parsed.error));
      return;
    }
    update.mutate(parsed.data);
  };

  return (
    <form className="card" onSubmit={submit}>
      <h2>
        {staff.staffNo} — {staff.firstName} {staff.lastName}
      </h2>
      <p className="muted">
        The login email cannot be changed here. Leaving date and “currently
        employed” are what take somebody off the active roll.
      </p>

      <div className="grid">
        <label>
          First name
          <input value={form.firstName} onChange={(e) => set('firstName', e.target.value)} required />
        </label>
        <label>
          Last name
          <input value={form.lastName} onChange={(e) => set('lastName', e.target.value)} required />
        </label>
        <label>
          Role
          <select value={form.role} onChange={(e) => set('role', e.target.value as Staff['role'])}>
            {ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>
        </label>
        <label>
          Department
          <select value={form.departmentId} onChange={(e) => set('departmentId', e.target.value)}>
            <option value="">—</option>
            {(departments.data ?? []).map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </label>
        <label>
          Designation
          <select value={form.designationId} onChange={(e) => set('designationId', e.target.value)}>
            <option value="">—</option>
            {(designations.data ?? []).map((d) => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </label>
        <label>
          Phone
          <input value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        </label>
        <label>
          Emergency phone
          <input value={form.emergencyPhone} onChange={(e) => set('emergencyPhone', e.target.value)} />
        </label>
        <label>
          Joined on
          <input type="date" value={form.joinedOn} onChange={(e) => set('joinedOn', e.target.value)} />
        </label>
        <label>
          Left on
          <input type="date" value={form.leftOn} onChange={(e) => set('leftOn', e.target.value)} />
        </label>
        <label>
          Monthly basic pay
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.basicSalaryMajor}
            onChange={(e) => set('basicSalaryMajor', e.target.value)}
          />
        </label>
      </div>

      <label>
        Address
        <textarea value={form.address} onChange={(e) => set('address', e.target.value)} rows={2} />
      </label>

      <label style={inlineLabel}>
        <input
          type="checkbox"
          checked={form.isActive}
          onChange={(e) => set('isActive', e.target.checked)}
        />
        Currently employed
      </label>

      {formErr && <div className="alert" role="alert">{formErr}</div>}
      <ErrorNote error={update.error} fallback="Could not save this staff member" />

      <div className="actions">
        <button type="submit" disabled={update.isPending}>
          {update.isPending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

// --- attendance ------------------------------------------------------------

function AttendanceTab() {
  const can = useCan();
  const queryClient = useQueryClient();
  const canMark = can('attendance:mark');

  const [onDate, setOnDate] = useState(todayIsoDate());
  const [departmentId, setDepartmentId] = useState('');
  const [draft, setDraft] = useState<Record<string, AttendanceStatus>>({});
  const [formErr, setFormErr] = useState<string | null>(null);

  const departments = useDepartments();
  const staff = useStaffLookup();

  const marked = useQuery({
    queryKey: ['hr', 'attendance', 'list', onDate, departmentId],
    queryFn: async () => {
      const { data } = await api.get<Attendance[]>('/hr/attendance', {
        params: { onDate, ...(departmentId ? { departmentId } : {}) },
      });
      return data;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      const entries = Object.entries(draft).map(([staffId, status]) => ({
        staffId,
        status,
      }));
      const { data } = await api.post<Attendance[]>('/hr/attendance', {
        onDate,
        entries,
      });
      return data;
    },
    onSuccess: async () => {
      setDraft({});
      setFormErr(null);
      await queryClient.invalidateQueries({ queryKey: ['hr', 'attendance'] });
    },
  });

  // The saved value is the truth; `draft` only holds what this session changed,
  // so switching date shows the server's answer without an effect to sync it.
  const savedFor = new Map((marked.data ?? []).map((a) => [a.staffId, a.status]));
  const roster = (staff.data ?? []).filter(
    (s) => !departmentId || s.department?.id === departmentId,
  );
  const pendingCount = Object.keys(draft).length;

  const submit = () => {
    setFormErr(null);
    if (pendingCount === 0) {
      setFormErr('Nothing has been changed yet');
      return;
    }
    save.mutate();
  };

  return (
    <div>
      <div className="toolbar">
        <label style={inlineLabel}>
          Date
          <input type="date" value={onDate} onChange={(e) => { setOnDate(e.target.value); setDraft({}); }} />
        </label>
        <select
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
          aria-label="Department"
        >
          <option value="">All departments</option>
          {(departments.data ?? []).map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
        {canMark && (
          <button type="button" onClick={submit} disabled={save.isPending || pendingCount === 0}>
            {save.isPending ? 'Saving…' : `Save ${pendingCount || ''} change${pendingCount === 1 ? '' : 's'}`}
          </button>
        )}
      </div>

      {formErr && <div className="alert" role="alert">{formErr}</div>}
      <ErrorNote error={marked.error} fallback="Could not load attendance" />
      <ErrorNote error={save.error} fallback="Could not save attendance" />

      {staff.isPending && <Loading label="Loading staff…" />}
      {!staff.isPending && roster.length === 0 && (
        <p className="muted">
          There is nobody on the roll for this filter, so there is no attendance to mark.
        </p>
      )}

      {roster.length > 0 && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Staff no.</th>
                <th>Name</th>
                <th>Department</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((s) => {
                const value = draft[s.id] ?? savedFor.get(s.id) ?? '';
                return (
                  <tr key={s.id}>
                    <td>{s.staffNo}</td>
                    <td>{s.firstName} {s.lastName}</td>
                    <td>{s.department?.name ?? '—'}</td>
                    <td>
                      <select
                        value={value}
                        disabled={!canMark}
                        aria-label={`Attendance for ${s.firstName} ${s.lastName}`}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            [s.id]: e.target.value as AttendanceStatus,
                          }))
                        }
                      >
                        <option value="">Not marked</option>
                        {ATTENDANCE_STATUSES.map((st) => (
                          <option key={st} value={st}>
                            {ATTENDANCE_STATUS_LABELS[st]}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// --- leave -----------------------------------------------------------------

function LeaveTab() {
  const can = useCan();
  const queryClient = useQueryClient();
  const canApprove = can('leave:approve');
  const canApply = can('leave:apply');

  const [status, setStatus] = useState<LeaveRequestStatus | ''>('pending');
  const [applying, setApplying] = useState(false);

  const list = useQuery({
    queryKey: ['hr', 'leave', 'list', status],
    queryFn: async () => {
      const { data } = await api.get<LeaveRequest[]>('/hr/leave', {
        params: status ? { status } : {},
      });
      return data;
    },
  });

  const decide = useMutation({
    mutationFn: async (input: { id: string; status: 'approved' | 'rejected' }) => {
      const body = decideLeaveSchema.parse({ status: input.status });
      const { data } = await api.post<LeaveRequest>(
        `/hr/leave/${input.id}/decide`,
        body,
      );
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['hr', 'leave'] });
    },
  });

  return (
    <div>
      <div className="toolbar">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as LeaveRequestStatus | '')}
          aria-label="Leave status"
        >
          <option value="">All requests</option>
          {LEAVE_STATUSES.map((s) => (
            <option key={s} value={s}>{LEAVE_STATUS_LABELS[s]}</option>
          ))}
        </select>
        {canApply && (
          <button type="button" onClick={() => setApplying((v) => !v)}>
            {applying ? 'Close' : 'Apply for leave'}
          </button>
        )}
      </div>

      {applying && canApply && (
        <LeaveForm
          onDone={async () => {
            setApplying(false);
            await queryClient.invalidateQueries({ queryKey: ['hr', 'leave'] });
          }}
        />
      )}

      <ErrorNote error={list.error} fallback="Could not load leave requests" />
      <ErrorNote error={decide.error} fallback="Could not record that decision" />
      {list.isPending && <Loading label="Loading leave requests…" />}
      {list.data?.length === 0 && (
        <p className="muted">No leave requests match this filter.</p>
      )}

      {!!list.data?.length && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Staff</th>
                <th>Type</th>
                <th>From</th>
                <th>To</th>
                <th className="num">Days</th>
                <th>Reason</th>
                <th>Status</th>
                <th>Decided by</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.data.map((r) => (
                <tr key={r.id}>
                  <td>{r.staffNo} — {r.staffName}</td>
                  <td>{r.leaveType.name}{r.leaveType.isPaid ? '' : ' (unpaid)'}</td>
                  <td>{formatDate(r.fromDate)}</td>
                  <td>{formatDate(r.toDate)}</td>
                  <td className="num">{r.days}</td>
                  <td>{r.reason ?? '—'}</td>
                  <td>
                    <StatusBadge status={r.status} label={LEAVE_STATUS_LABELS[r.status]} />
                  </td>
                  <td>{r.decidedBy ?? '—'}</td>
                  <td>
                    {canApprove && r.status === 'pending' && (
                      <span className="actions">
                        <button
                          type="button"
                          disabled={decide.isPending}
                          onClick={() => decide.mutate({ id: r.id, status: 'approved' })}
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={decide.isPending}
                          onClick={() => decide.mutate({ id: r.id, status: 'rejected' })}
                        >
                          Reject
                        </button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {canApprove && <LeaveBalancePanel />}
    </div>
  );
}

function LeaveForm({ onDone }: { onDone: () => Promise<void> }) {
  const staff = useStaffLookup();
  const [formErr, setFormErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    staffId: '',
    leaveTypeId: '',
    fromDate: todayIsoDate(),
    toDate: todayIsoDate(),
    reason: '',
  });

  const leaveTypes = useQuery({
    queryKey: ['hr', 'leave-types', 'list'],
    queryFn: async () => {
      const { data } = await api.get<LeaveType[]>('/hr/leave-types');
      return data;
    },
  });

  const apply = useMutation({
    mutationFn: async (payload: ApplyLeaveInput) => {
      const { data } = await api.post<LeaveRequest>('/hr/leave', payload);
      return data;
    },
    onSuccess: onDone,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    const parsed = applyLeaveSchema.safeParse({
      staffId: blankToUndefined(form.staffId),
      leaveTypeId: form.leaveTypeId,
      fromDate: form.fromDate,
      toDate: form.toDate,
      reason: blankToUndefined(form.reason),
    });
    if (!parsed.success) {
      setFormErr(zodMessage(parsed.error));
      return;
    }
    apply.mutate(parsed.data);
  };

  const days = leaveDaysBetween(form.fromDate, form.toDate);

  return (
    <form className="card" onSubmit={submit}>
      <h2>Apply for leave</h2>
      <div className="grid">
        <label>
          Staff member
          <select value={form.staffId} onChange={(e) => setForm((f) => ({ ...f, staffId: e.target.value }))}>
            <option value="">Myself</option>
            {(staff.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>{staffLabel(s)}</option>
            ))}
          </select>
        </label>
        <label>
          Leave type
          <select
            value={form.leaveTypeId}
            onChange={(e) => setForm((f) => ({ ...f, leaveTypeId: e.target.value }))}
            required
          >
            <option value="">Choose…</option>
            {(leaveTypes.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}{t.isPaid ? '' : ' (unpaid)'}
              </option>
            ))}
          </select>
        </label>
        <label>
          From
          <input
            type="date"
            value={form.fromDate}
            onChange={(e) => setForm((f) => ({ ...f, fromDate: e.target.value }))}
            required
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={form.toDate}
            onChange={(e) => setForm((f) => ({ ...f, toDate: e.target.value }))}
            required
          />
        </label>
      </div>
      <label>
        Reason
        <textarea
          value={form.reason}
          onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
          rows={2}
        />
      </label>
      <p className="muted">
        {days > 0 ? `${days} day${days === 1 ? '' : 's'}, counting both ends.` : 'Check the dates.'}
      </p>

      {formErr && <div className="alert" role="alert">{formErr}</div>}
      <ErrorNote error={apply.error} fallback="Could not submit this request" />
      <div className="actions">
        <button type="submit" disabled={apply.isPending}>
          {apply.isPending ? 'Submitting…' : 'Submit request'}
        </button>
      </div>
    </form>
  );
}

function LeaveBalancePanel() {
  const staff = useStaffLookup();
  const [staffId, setStaffId] = useState('');
  const year = new Date().getFullYear();

  const balance = useQuery({
    queryKey: ['hr', 'leave', 'balance', staffId, year],
    enabled: !!staffId,
    queryFn: async () => {
      const { data } = await api.get<LeaveBalance[]>('/hr/leave/balance', {
        params: { staffId, year },
      });
      return data;
    },
  });

  return (
    <div className="card">
      <h2>Leave balance, {year}</h2>
      <label>
        Staff member
        <select value={staffId} onChange={(e) => setStaffId(e.target.value)}>
          <option value="">Choose…</option>
          {(staff.data ?? []).map((s) => (
            <option key={s.id} value={s.id}>{staffLabel(s)}</option>
          ))}
        </select>
      </label>

      {!staffId && <p className="muted">Pick somebody to see their balance.</p>}
      <ErrorNote error={balance.error} fallback="Could not load the balance" />
      {staffId && balance.isPending && <Loading label="Loading balance…" />}
      {balance.data?.length === 0 && (
        <p className="muted">No leave types are set up yet.</p>
      )}

      {!!balance.data?.length && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Type</th>
                <th className="num">Entitlement</th>
                <th className="num">Approved</th>
                <th className="num">Pending</th>
                <th className="num">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {balance.data.map((b) => (
                <tr key={b.leaveTypeId}>
                  <td>{b.leaveTypeName}</td>
                  <td className="num">{b.daysPerYear ?? 'Uncapped'}</td>
                  <td className="num">{b.approvedDays}</td>
                  <td className="num">{b.pendingDays}</td>
                  <td className="num">{b.remainingDays ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// --- roster ----------------------------------------------------------------

function RosterTab() {
  const can = useCan();
  const queryClient = useQueryClient();
  const canManage = can('roster:manage');

  const [weekStart, setWeekStart] = useState(todayIsoDate());
  const [assigning, setAssigning] = useState(false);
  const weekEnd = shiftDate(weekStart, 6);
  const days = Array.from({ length: 7 }, (_, i) => shiftDate(weekStart, i));

  const staff = useStaffLookup();

  const roster = useQuery({
    queryKey: ['hr', 'roster', 'list', weekStart, weekEnd],
    queryFn: async () => {
      const { data } = await api.get<RosterEntry[]>('/hr/roster', {
        params: { from: weekStart, to: weekEnd },
      });
      return data;
    },
  });

  const byStaffDay = new Map<string, RosterEntry[]>();
  for (const e of roster.data ?? []) {
    const key = `${e.staffId}|${e.onDate}`;
    const bucket = byStaffDay.get(key);
    if (bucket) bucket.push(e);
    else byStaffDay.set(key, [e]);
  }

  // Only people who actually appear on this week's roster, so the grid is a
  // duty sheet rather than the whole payroll with empty rows.
  const rosteredIds = new Set((roster.data ?? []).map((e) => e.staffId));
  const rows = (staff.data ?? []).filter((s) => rosteredIds.has(s.id));

  return (
    <div>
      <div className="toolbar">
        <label style={inlineLabel}>
          Week from
          <input type="date" value={weekStart} onChange={(e) => setWeekStart(e.target.value)} />
        </label>
        <button type="button" onClick={() => setWeekStart(shiftDate(weekStart, -7))}>
          ← Previous week
        </button>
        <button type="button" onClick={() => setWeekStart(shiftDate(weekStart, 7))}>
          Next week →
        </button>
        {canManage && (
          <button type="button" onClick={() => setAssigning((v) => !v)}>
            {assigning ? 'Close' : 'Assign shifts'}
          </button>
        )}
      </div>

      {assigning && canManage && (
        <RosterForm
          defaultDate={weekStart}
          onDone={async () => {
            setAssigning(false);
            await queryClient.invalidateQueries({ queryKey: ['hr', 'roster'] });
          }}
        />
      )}

      <ErrorNote error={roster.error} fallback="Could not load the roster" />
      {roster.isPending && <Loading label="Loading roster…" />}
      {roster.data?.length === 0 && (
        <p className="muted">
          Nobody is rostered for the week of {formatDate(weekStart)}.
          {canManage && ' Use “Assign shifts” to build it.'}
        </p>
      )}

      {rows.length > 0 && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Staff</th>
                {days.map((d) => (
                  <th key={d}>{formatDate(d)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td>{s.staffNo} — {s.firstName} {s.lastName}</td>
                  {days.map((d) => {
                    const entries = byStaffDay.get(`${s.id}|${d}`) ?? [];
                    return (
                      <td key={d}>
                        {entries.length === 0
                          ? '—'
                          : entries.map((e) => (
                              <div key={e.id}>
                                {e.shift.name} {e.shift.startTime}–{e.shift.endTime}
                                {e.wardName ? ` · ${e.wardName}` : ''}
                              </div>
                            ))}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function RosterForm({
  defaultDate,
  onDone,
}: {
  defaultDate: string;
  onDone: () => Promise<void>;
}) {
  const staff = useStaffLookup();
  const [formErr, setFormErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    staffId: '',
    shiftId: '',
    onDate: defaultDate,
    note: '',
  });

  const shifts = useQuery({
    queryKey: ['hr', 'shifts', 'list'],
    queryFn: async () => {
      const { data } = await api.get<Shift[]>('/hr/shifts');
      return data;
    },
  });

  const assign = useMutation({
    mutationFn: async () => {
      const body = assignRosterSchema.parse({
        entries: [
          {
            staffId: form.staffId,
            shiftId: form.shiftId,
            onDate: form.onDate,
            note: blankToUndefined(form.note),
          },
        ],
      });
      const { data } = await api.post<RosterEntry[]>('/hr/roster', body);
      return data;
    },
    onSuccess: onDone,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    if (!form.staffId || !form.shiftId) {
      setFormErr('Choose a staff member and a shift');
      return;
    }
    assign.mutate();
  };

  return (
    <form className="card" onSubmit={submit}>
      <h2>Assign a shift</h2>
      <div className="grid">
        <label>
          Staff member
          <select
            value={form.staffId}
            onChange={(e) => setForm((f) => ({ ...f, staffId: e.target.value }))}
            required
          >
            <option value="">Choose…</option>
            {(staff.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>{staffLabel(s)}</option>
            ))}
          </select>
        </label>
        <label>
          Shift
          <select
            value={form.shiftId}
            onChange={(e) => setForm((f) => ({ ...f, shiftId: e.target.value }))}
            required
          >
            <option value="">Choose…</option>
            {(shifts.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.startTime}–{s.endTime})
              </option>
            ))}
          </select>
        </label>
        <label>
          Date
          <input
            type="date"
            value={form.onDate}
            onChange={(e) => setForm((f) => ({ ...f, onDate: e.target.value }))}
            required
          />
        </label>
        <label>
          Note
          <input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
        </label>
      </div>

      {formErr && <div className="alert" role="alert">{formErr}</div>}
      <ErrorNote error={assign.error} fallback="Could not assign this shift" />
      <div className="actions">
        <button type="submit" disabled={assign.isPending}>
          {assign.isPending ? 'Assigning…' : 'Assign'}
        </button>
      </div>
    </form>
  );
}

// --- payroll ---------------------------------------------------------------

function PayrollTab() {
  const can = useCan();
  const queryClient = useQueryClient();
  const canManage = can('payroll:manage');

  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const [formErr, setFormErr] = useState<string | null>(null);
  const now = new Date();
  const [form, setForm] = useState({
    year: String(now.getFullYear()),
    month: String(now.getMonth() + 1),
    note: '',
  });

  const runs = useQuery({
    queryKey: ['hr', 'payroll', 'runs'],
    queryFn: async () => {
      const { data } = await api.get<PayrollRun[]>('/hr/payroll/runs');
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const body = createPayrollRunSchema.parse({
        year: Number(form.year),
        month: Number(form.month),
        note: blankToUndefined(form.note),
      });
      const { data } = await api.post<PayrollRun>('/hr/payroll/runs', body);
      return data;
    },
    onSuccess: async (run) => {
      setFormErr(null);
      setOpenRunId(run.id);
      await queryClient.invalidateQueries({ queryKey: ['hr', 'payroll'] });
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    const parsed = createPayrollRunSchema.safeParse({
      year: Number(form.year),
      month: Number(form.month),
      note: blankToUndefined(form.note),
    });
    if (!parsed.success) {
      setFormErr(zodMessage(parsed.error));
      return;
    }
    create.mutate();
  };

  return (
    <div>
      {canManage && (
        <form className="card" onSubmit={submit}>
          <h2>Open a month</h2>
          <p className="muted">
            This drafts one payslip for every active staff member, using their
            current basic pay. Their name and designation are recorded on the
            payslip as they are today.
          </p>
          <div className="toolbar">
            <label style={inlineLabel}>
              Year
              <input
                type="number"
                min="2000"
                max="2200"
                value={form.year}
                onChange={(e) => setForm((f) => ({ ...f, year: e.target.value }))}
              />
            </label>
            <label style={inlineLabel}>
              Month
              <input
                type="number"
                min="1"
                max="12"
                value={form.month}
                onChange={(e) => setForm((f) => ({ ...f, month: e.target.value }))}
              />
            </label>
            <label style={inlineLabel}>
              Note
              <input value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
            </label>
            <button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Opening…' : 'Open run'}
            </button>
          </div>
          {formErr && <div className="alert" role="alert">{formErr}</div>}
          <ErrorNote error={create.error} fallback="Could not open this payroll run" />
        </form>
      )}

      <ErrorNote error={runs.error} fallback="Could not load payroll runs" />
      {runs.isPending && <Loading label="Loading payroll runs…" />}
      {runs.data?.length === 0 && (
        <p className="muted">No payroll has been run yet.</p>
      )}

      {!!runs.data?.length && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Status</th>
                <th className="num">Payslips</th>
                <th className="num">Total net</th>
                <th>Note</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {runs.data.map((r) => (
                <tr key={r.id}>
                  <td>{String(r.month).padStart(2, '0')}/{r.year}</td>
                  <td>
                    <StatusBadge status={r.status} label={PAYROLL_STATUS_LABELS[r.status]} />
                  </td>
                  <td className="num">{r.payslipCount}</td>
                  <td className="num">{formatMoney(r.totalNetMinor)}</td>
                  <td>{r.note ?? '—'}</td>
                  <td>
                    <button
                      type="button"
                      onClick={() => setOpenRunId(openRunId === r.id ? null : r.id)}
                    >
                      {openRunId === r.id ? 'Close' : 'Open'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {openRunId && <PayrollRunPanel runId={openRunId} />}
    </div>
  );
}

function PayrollRunPanel({ runId }: { runId: string }) {
  const can = useCan();
  const queryClient = useQueryClient();
  const canManage = can('payroll:manage');
  const [editing, setEditing] = useState<string | null>(null);

  const run = useQuery({
    queryKey: ['hr', 'payroll', 'run', runId],
    queryFn: async () => {
      const { data } = await api.get<PayrollRun & { payslips: Payslip[] }>(
        `/hr/payroll/runs/${runId}`,
      );
      return data;
    },
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['hr', 'payroll'] });
  };

  const finalise = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<PayrollRun>(`/hr/payroll/runs/${runId}/finalise`);
      return data;
    },
    onSuccess: invalidate,
  });

  const pay = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<PayrollRun>(`/hr/payroll/runs/${runId}/pay`);
      return data;
    },
    onSuccess: invalidate,
  });

  if (run.isPending) return <Loading label="Loading payslips…" />;
  if (run.error) return <ErrorNote error={run.error} fallback="Could not load this run" />;
  if (!run.data) return null;

  const isDraft = run.data.status === 'draft';

  return (
    <div className="card">
      <h2>
        Payroll {String(run.data.month).padStart(2, '0')}/{run.data.year}{' '}
        <StatusBadge status={run.data.status} label={PAYROLL_STATUS_LABELS[run.data.status]} />
      </h2>
      {!isDraft && (
        <p className="muted">
          This run is {PAYROLL_STATUS_LABELS[run.data.status].toLowerCase()}, so its
          payslips can no longer be changed. A correction belongs in the next
          month's run, where it is visible.
        </p>
      )}

      {canManage && (
        <div className="actions">
          <button type="button" disabled={!isDraft || finalise.isPending} onClick={() => finalise.mutate()}>
            {finalise.isPending ? 'Finalising…' : 'Finalise'}
          </button>
          <button
            type="button"
            disabled={run.data.status !== 'finalised' || pay.isPending}
            onClick={() => pay.mutate()}
          >
            {pay.isPending ? 'Marking…' : 'Mark paid'}
          </button>
        </div>
      )}
      <ErrorNote error={finalise.error} fallback="Could not finalise this run" />
      <ErrorNote error={pay.error} fallback="Could not mark this run paid" />

      {run.data.payslips.length === 0 && (
        <p className="muted">
          This run has no payslips — there were no active staff when it was opened.
        </p>
      )}

      {run.data.payslips.length > 0 && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Staff no.</th>
                <th>Name</th>
                <th>Designation</th>
                <th className="num">Basic</th>
                <th className="num">Earnings</th>
                <th className="num">Deductions</th>
                <th className="num">Net</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {run.data.payslips.map((p) => (
                <tr key={p.id}>
                  <td>{p.staffNo}</td>
                  <td>{p.staffName}</td>
                  <td>{p.designation ?? '—'}</td>
                  <td className="num">{formatMoney(p.basicMinor)}</td>
                  <td className="num">{formatMoney(p.earningsMinor)}</td>
                  <td className="num">{formatMoney(p.deductionsMinor)}</td>
                  <td className="num">{formatMoney(p.netMinor)}</td>
                  <td>
                    {canManage && isDraft && (
                      <button
                        type="button"
                        onClick={() => setEditing(editing === p.id ? null : p.id)}
                      >
                        {editing === p.id ? 'Close' : 'Edit'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && isDraft && (
        <PayslipForm
          payslip={run.data.payslips.find((p) => p.id === editing) as Payslip}
          onDone={async () => {
            setEditing(null);
            await invalidate();
          }}
        />
      )}
    </div>
  );
}

interface LineDraft {
  kind: 'earning' | 'deduction';
  name: string;
  amountMajor: string;
}

function PayslipForm({
  payslip,
  onDone,
}: {
  payslip: Payslip;
  onDone: () => Promise<void>;
}) {
  const [basicMajor, setBasicMajor] = useState(String(payslip.basicMinor / 100));
  const [lines, setLines] = useState<LineDraft[]>(
    payslip.lines.map((l) => ({
      kind: l.kind,
      name: l.name,
      amountMajor: String(l.amountMinor / 100),
    })),
  );
  const [formErr, setFormErr] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const body = updatePayslipSchema.parse({
        basicMinor: minorOf(basicMajor),
        lines: lines.map((l) => ({
          kind: l.kind,
          name: l.name.trim(),
          amountMinor: minorOf(l.amountMajor),
        })),
      });
      const { data } = await api.patch<Payslip>(
        `/hr/payroll/slips/${payslip.id}`,
        body,
      );
      return data;
    },
    onSuccess: onDone,
  });

  // The same function the API and the printed slip use, so the preview cannot
  // promise a number the payslip will not show.
  const preview = computePayslip({
    basicMinor: minorOf(basicMajor),
    lines: lines.map((l) => ({ kind: l.kind, amountMinor: minorOf(l.amountMajor) })),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    if (lines.some((l) => !l.name.trim())) {
      setFormErr('Every line needs a name');
      return;
    }
    save.mutate();
  };

  return (
    <form className="card" onSubmit={submit}>
      <h3>{payslip.staffNo} — {payslip.staffName}</h3>

      <label>
        Basic pay
        <input
          type="number"
          min="0"
          step="0.01"
          value={basicMajor}
          onChange={(e) => setBasicMajor(e.target.value)}
        />
      </label>

      <table>
        <thead>
          <tr>
            <th>Kind</th>
            <th>Name</th>
            <th className="num">Amount</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <tr key={i}>
              <td>
                <select
                  value={l.kind}
                  aria-label={`Line ${i + 1} kind`}
                  onChange={(e) =>
                    setLines((ls) =>
                      ls.map((x, j) =>
                        j === i ? { ...x, kind: e.target.value as LineDraft['kind'] } : x,
                      ),
                    )
                  }
                >
                  <option value="earning">Earning</option>
                  <option value="deduction">Deduction</option>
                </select>
              </td>
              <td>
                <input
                  value={l.name}
                  aria-label={`Line ${i + 1} name`}
                  onChange={(e) =>
                    setLines((ls) => ls.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))
                  }
                />
              </td>
              <td className="num">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={l.amountMajor}
                  aria-label={`Line ${i + 1} amount`}
                  onChange={(e) =>
                    setLines((ls) =>
                      ls.map((x, j) => (j === i ? { ...x, amountMajor: e.target.value } : x)),
                    )
                  }
                />
              </td>
              <td>
                <button
                  type="button"
                  onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))}
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="actions">
        <button
          type="button"
          onClick={() =>
            setLines((ls) => [...ls, { kind: 'earning', name: '', amountMajor: '' }])
          }
        >
          Add line
        </button>
      </div>

      <p>
        Earnings {formatMoney(preview.earningsMinor)} · Deductions{' '}
        {formatMoney(preview.deductionsMinor)} · <strong>Net {formatMoney(preview.netMinor)}</strong>
      </p>

      {formErr && <div className="alert" role="alert">{formErr}</div>}
      <ErrorNote error={save.error} fallback="Could not save this payslip" />
      <div className="actions">
        <button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save payslip'}
        </button>
      </div>
    </form>
  );
}

// --- setup -----------------------------------------------------------------

function SetupTab() {
  const can = useCan();
  return (
    <div>
      <NamedEditor
        title="Departments"
        path="departments"
        canManage={can('staff:manage')}
      />
      <NamedEditor
        title="Designations"
        path="designations"
        canManage={can('staff:manage')}
      />
      <LeaveTypeEditor canManage={can('leave:approve')} />
      <ShiftEditor canManage={can('roster:manage')} />
    </div>
  );
}

function NamedEditor({
  title,
  path,
  canManage,
}: {
  title: string;
  path: 'departments' | 'designations';
  canManage: boolean;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [formErr, setFormErr] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['hr', path, 'list'],
    queryFn: async () => {
      const { data } = await api.get<HrNamed[]>(`/hr/${path}`);
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const body = createHrNamedSchema.parse({ name });
      const { data } = await api.post<HrNamed>(`/hr/${path}`, body);
      return data;
    },
    onSuccess: async () => {
      setName('');
      setFormErr(null);
      await queryClient.invalidateQueries({ queryKey: ['hr', path] });
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    const parsed = createHrNamedSchema.safeParse({ name });
    if (!parsed.success) {
      setFormErr(zodMessage(parsed.error));
      return;
    }
    create.mutate();
  };

  return (
    <div className="card">
      <h2>{title}</h2>
      <ErrorNote error={list.error} fallback={`Could not load ${title.toLowerCase()}`} />
      {list.isPending && <Loading />}
      {list.data?.length === 0 && (
        <p className="muted">None yet.</p>
      )}
      {!!list.data?.length && (
        <ul>
          {list.data.map((r) => (
            <li key={r.id}>{r.name}</li>
          ))}
        </ul>
      )}

      {canManage && (
        <form className="toolbar" onSubmit={submit}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={`New ${title.toLowerCase().replace(/s$/, '')}`}
            aria-label={`New ${title}`}
          />
          <button type="submit" disabled={create.isPending}>Add</button>
        </form>
      )}
      {formErr && <div className="alert" role="alert">{formErr}</div>}
      <ErrorNote error={create.error} fallback="Could not add that" />
    </div>
  );
}

function LeaveTypeEditor({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: '', daysPerYear: '', isPaid: true });
  const [formErr, setFormErr] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['hr', 'leave-types', 'list'],
    queryFn: async () => {
      const { data } = await api.get<LeaveType[]>('/hr/leave-types');
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const body = createLeaveTypeSchema.parse({
        name: form.name,
        daysPerYear: form.daysPerYear ? Number(form.daysPerYear) : null,
        isPaid: form.isPaid,
      });
      const { data } = await api.post<LeaveType>('/hr/leave-types', body);
      return data;
    },
    onSuccess: async () => {
      setForm({ name: '', daysPerYear: '', isPaid: true });
      setFormErr(null);
      await queryClient.invalidateQueries({ queryKey: ['hr', 'leave-types'] });
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    const parsed = createLeaveTypeSchema.safeParse({
      name: form.name,
      daysPerYear: form.daysPerYear ? Number(form.daysPerYear) : null,
      isPaid: form.isPaid,
    });
    if (!parsed.success) {
      setFormErr(zodMessage(parsed.error));
      return;
    }
    create.mutate();
  };

  return (
    <div className="card">
      <h2>Leave types</h2>
      <p className="muted">
        Leave an entitlement blank for uncapped leave, such as unpaid leave.
      </p>
      <ErrorNote error={list.error} fallback="Could not load leave types" />
      {list.isPending && <Loading />}
      {list.data?.length === 0 && <p className="muted">None yet.</p>}
      {!!list.data?.length && (
        <ul>
          {list.data.map((t) => (
            <li key={t.id}>
              {t.name} — {t.daysPerYear ?? 'uncapped'} days/year
              {t.isPaid ? '' : ', unpaid'}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <form className="toolbar" onSubmit={submit}>
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="New leave type"
            aria-label="New leave type"
          />
          <input
            type="number"
            min="0"
            max="365"
            value={form.daysPerYear}
            onChange={(e) => setForm((f) => ({ ...f, daysPerYear: e.target.value }))}
            placeholder="Days/year"
            aria-label="Days per year"
          />
          <label style={inlineLabel}>
            <input
              type="checkbox"
              checked={form.isPaid}
              onChange={(e) => setForm((f) => ({ ...f, isPaid: e.target.checked }))}
            />
            Paid
          </label>
          <button type="submit" disabled={create.isPending}>Add</button>
        </form>
      )}
      {formErr && <div className="alert" role="alert">{formErr}</div>}
      <ErrorNote error={create.error} fallback="Could not add that leave type" />
    </div>
  );
}

function ShiftEditor({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: '', startTime: '08:00', endTime: '16:00' });
  const [formErr, setFormErr] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['hr', 'shifts', 'list'],
    queryFn: async () => {
      const { data } = await api.get<Shift[]>('/hr/shifts');
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const body = createShiftSchema.parse(form);
      const { data } = await api.post<Shift>('/hr/shifts', body);
      return data;
    },
    onSuccess: async () => {
      setForm({ name: '', startTime: '08:00', endTime: '16:00' });
      setFormErr(null);
      await queryClient.invalidateQueries({ queryKey: ['hr', 'shifts'] });
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    const parsed = createShiftSchema.safeParse(form);
    if (!parsed.success) {
      setFormErr(zodMessage(parsed.error));
      return;
    }
    create.mutate();
  };

  return (
    <div className="card">
      <h2>Shifts</h2>
      <p className="muted">A night shift may legitimately end before it starts.</p>
      <ErrorNote error={list.error} fallback="Could not load shifts" />
      {list.isPending && <Loading />}
      {list.data?.length === 0 && <p className="muted">None yet.</p>}
      {!!list.data?.length && (
        <ul>
          {list.data.map((s) => (
            <li key={s.id}>
              {s.name} — {s.startTime}–{s.endTime}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <form className="toolbar" onSubmit={submit}>
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="New shift"
            aria-label="New shift"
          />
          <input
            type="time"
            value={form.startTime}
            onChange={(e) => setForm((f) => ({ ...f, startTime: e.target.value }))}
            aria-label="Start time"
          />
          <input
            type="time"
            value={form.endTime}
            onChange={(e) => setForm((f) => ({ ...f, endTime: e.target.value }))}
            aria-label="End time"
          />
          <button type="submit" disabled={create.isPending}>Add</button>
        </form>
      )}
      {formErr && <div className="alert" role="alert">{formErr}</div>}
      <ErrorNote error={create.error} fallback="Could not add that shift" />
    </div>
  );
}
