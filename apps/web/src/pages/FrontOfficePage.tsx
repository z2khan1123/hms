import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CALL_DIRECTION_LABELS,
  COMPLAINT_SEVERITY_LABELS,
  COMPLAINT_STATUS_LABELS,
  POSTAL_DIRECTION_LABELS,
  callDirectionSchema,
  complaintSeveritySchema,
  complaintStatusSchema,
  createComplaintSchema,
  createPhoneCallSchema,
  createPostalItemSchema,
  createVisitorSchema,
  postalDirectionSchema,
  requiresResolution,
  updateComplaintSchema,
  type CallDirection,
  type Complaint,
  type ComplaintSeverity,
  type ComplaintStatus,
  type CreateComplaintInput,
  type CreatePhoneCallInput,
  type CreatePostalItemInput,
  type CreateVisitorInput,
  type Paginated,
  type Patient,
  type PhoneCall,
  type PostalDirection,
  type PostalItem,
  type Visitor,
} from '@hms/shared';
import { api } from '../lib/api';
import { useCan } from '../lib/permissions';
import { blankToUndefined, formatDate, formatDateTime, todayIsoDate } from '../lib/format';
import { ErrorNote, Loading } from '../components/QueryFeedback';
import { SearchSelect } from '../components/SearchSelect';
import { StatusBadge } from '../components/StatusBadge';
import { Tabs, type TabDef } from '../components/Tabs';
import { useDebounced } from '../lib/useDebounced';

type TabValue = 'visitors' | 'calls' | 'postal' | 'complaints';

const DIRECTIONS = callDirectionSchema.options;
const POSTAL_DIRECTIONS = postalDirectionSchema.options;
const SEVERITIES = complaintSeveritySchema.options;
const STATUSES = complaintStatusSchema.options;

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

/** Shared patient type-ahead — every book here can optionally name a patient. */
function usePatientLookup(query: string) {
  const debounced = useDebounced(query, 300);
  return useQuery({
    queryKey: ['patients', 'lookup', debounced],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Patient>>('/patients', {
        params: { page: 1, pageSize: 20, ...(debounced ? { q: debounced } : {}) },
      });
      return data.data;
    },
  });
}

export function FrontOfficePage() {
  const can = useCan();
  const tabs: TabDef<TabValue>[] = [
    { value: 'visitors', label: 'Visitors' },
    { value: 'calls', label: 'Calls' },
    { value: 'postal', label: 'Postal' },
  ];
  if (can('complaint:read')) tabs.push({ value: 'complaints', label: 'Complaints' });

  const [tab, setTab] = useState<TabValue>('visitors');

  return (
    <section>
      <h1>Front office</h1>
      <Tabs tabs={tabs} value={tab} onChange={setTab} ariaLabel="Front office sections" />
      {tab === 'visitors' && <VisitorsTab />}
      {tab === 'calls' && <CallsTab />}
      {tab === 'postal' && <PostalTab />}
      {tab === 'complaints' && can('complaint:read') && <ComplaintsTab />}
    </section>
  );
}

// --- visitors --------------------------------------------------------------

function VisitorsTab() {
  const can = useCan();
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [insideOnly, setInsideOnly] = useState(true);
  const [adding, setAdding] = useState(false);
  const debounced = useDebounced(q, 300);

  const visitors = useQuery({
    queryKey: ['frontoffice', 'visitors', debounced, insideOnly],
    queryFn: async () => {
      const { data } = await api.get<Visitor[]>('/front-office/visitors', {
        params: {
          ...(debounced ? { q: debounced } : {}),
          ...(insideOnly ? { insideOnly: 'true' } : {}),
        },
      });
      return data;
    },
  });

  const signOut = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post<Visitor>(`/front-office/visitors/${id}/sign-out`, {});
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['frontoffice', 'visitors'] });
    },
  });

  const insideCount = (visitors.data ?? []).filter((v) => v.isInside).length;
  const headCount = (visitors.data ?? [])
    .filter((v) => v.isInside)
    .reduce((sum, v) => sum + v.numberOfVisitors, 0);

  return (
    <div>
      <div className="toolbar">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, pass or phone"
          aria-label="Search visitors"
        />
        <label style={inlineLabel}>
          <input
            type="checkbox"
            checked={insideOnly}
            onChange={(e) => setInsideOnly(e.target.checked)}
          />
          Still inside
        </label>
        {can('frontoffice:manage') && (
          <button type="button" onClick={() => setAdding((v) => !v)}>
            {adding ? 'Close' : 'Sign in a visitor'}
          </button>
        )}
      </div>

      {insideOnly && !!visitors.data?.length && (
        <div className="card">
          <p>
            <strong>{headCount}</strong> people inside on {insideCount} pass
            {insideCount === 1 ? '' : 'es'}.
          </p>
          <p className="muted">
            Derived from who has not signed out, which is what makes this usable
            as an evacuation list.
          </p>
        </div>
      )}

      {adding && can('frontoffice:manage') && (
        <VisitorForm
          onDone={async () => {
            setAdding(false);
            await queryClient.invalidateQueries({ queryKey: ['frontoffice', 'visitors'] });
          }}
        />
      )}

      <ErrorNote error={visitors.error} fallback="Could not load the visitor book" />
      <ErrorNote error={signOut.error} fallback="Could not sign that visitor out" />
      {visitors.isPending && <Loading label="Loading visitors…" />}
      {visitors.data?.length === 0 && (
        <p className="muted">
          {insideOnly ? 'Nobody is signed in right now.' : 'No visitors match this filter.'}
        </p>
      )}

      {!!visitors.data?.length && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Pass</th>
                <th>Name</th>
                <th className="num">People</th>
                <th>Visiting</th>
                <th>Purpose</th>
                <th>Arrived</th>
                <th>Left</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {visitors.data.map((v) => (
                <tr key={v.id}>
                  <td>{v.passNo}</td>
                  <td>
                    {v.name}
                    {v.phone ? ` · ${v.phone}` : ''}
                  </td>
                  <td className="num">{v.numberOfVisitors}</td>
                  <td>
                    {v.patient
                      ? `${v.patient.mrn} — ${v.patient.firstName} ${v.patient.lastName}`
                      : (v.visitingWhom ?? '—')}
                  </td>
                  <td>{v.purpose ?? '—'}</td>
                  <td>{formatDateTime(v.arrivedAt)}</td>
                  <td>
                    {v.leftAt ? (
                      formatDateTime(v.leftAt)
                    ) : (
                      <StatusBadge status="inside" label="Inside" />
                    )}
                  </td>
                  <td>
                    {can('frontoffice:manage') && v.isInside && (
                      <button
                        type="button"
                        disabled={signOut.isPending}
                        onClick={() => signOut.mutate(v.id)}
                      >
                        Sign out
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

function VisitorForm({ onDone }: { onDone: () => Promise<void> }) {
  const [formErr, setFormErr] = useState<string | null>(null);
  const [patientQ, setPatientQ] = useState('');
  const [chosenPatient, setChosenPatient] = useState<Patient | null>(null);
  const patients = usePatientLookup(patientQ);

  const [form, setForm] = useState({
    name: '',
    phone: '',
    patientId: '',
    visitingWhom: '',
    purpose: '',
    idCardLast4: '',
    numberOfVisitors: '1',
    note: '',
  });

  const create = useMutation({
    mutationFn: async (payload: CreateVisitorInput) => {
      const { data } = await api.post<Visitor>('/front-office/visitors', payload);
      return data;
    },
    onSuccess: onDone,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    const parsed = createVisitorSchema.safeParse({
      name: form.name,
      phone: blankToUndefined(form.phone),
      patientId: blankToUndefined(form.patientId),
      visitingWhom: blankToUndefined(form.visitingWhom),
      purpose: blankToUndefined(form.purpose),
      idCardLast4: blankToUndefined(form.idCardLast4),
      numberOfVisitors: Number(form.numberOfVisitors) || 1,
      note: blankToUndefined(form.note),
    });
    if (!parsed.success) {
      setFormErr(zodMessage(parsed.error));
      return;
    }
    if (!parsed.data.patientId && !parsed.data.visitingWhom) {
      setFormErr('Say who the visitor has come to see');
      return;
    }
    create.mutate(parsed.data);
  };

  return (
    <form className="card" onSubmit={submit}>
      <h2>Sign in a visitor</h2>
      <div className="grid">
        <label>
          Name
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
        </label>
        <label>
          Phone
          <input
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            placeholder="+923001234567"
          />
        </label>
        <label>
          How many people
          <input
            type="number"
            min="1"
            max="50"
            value={form.numberOfVisitors}
            onChange={(e) => setForm((f) => ({ ...f, numberOfVisitors: e.target.value }))}
          />
        </label>
        <label>
          ID card, last 4
          <input
            value={form.idCardLast4}
            onChange={(e) => setForm((f) => ({ ...f, idCardLast4: e.target.value }))}
          />
        </label>
      </div>

      <SearchSelect
        label="Visiting a patient"
        placeholder="Search patients"
        query={patientQ}
        onQueryChange={setPatientQ}
        items={patients.data ?? []}
        isLoading={patients.isFetching}
        error={patients.error}
        emptyLabel="No patient matches"
        getKey={(p) => p.id}
        renderItem={(p) => (
          <>
            <div>
              {p.mrn} — {p.firstName} {p.lastName}
            </div>
            <div className="muted">{p.phone}</div>
          </>
        )}
        onSelect={(p) => {
          setForm((f) => ({ ...f, patientId: p.id }));
          setChosenPatient(p);
        }}
      />
      {chosenPatient && (
        <p className="muted">
          Visiting <strong>{chosenPatient.firstName} {chosenPatient.lastName}</strong>{' '}
          ({chosenPatient.mrn}).{' '}
          <button
            type="button"
            onClick={() => {
              setForm((f) => ({ ...f, patientId: '' }));
              setChosenPatient(null);
            }}
          >
            Clear
          </button>
        </p>
      )}

      <div className="grid">
        <label>
          Or visiting whom
          <input
            value={form.visitingWhom}
            onChange={(e) => setForm((f) => ({ ...f, visitingWhom: e.target.value }))}
            placeholder="Accounts, Dr Khan, the lab"
          />
        </label>
        <label>
          Purpose
          <input
            value={form.purpose}
            onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}
          />
        </label>
      </div>

      {formErr && <div className="alert" role="alert">{formErr}</div>}
      <ErrorNote error={create.error} fallback="Could not sign this visitor in" />
      <div className="actions">
        <button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Saving…' : 'Sign in'}
        </button>
      </div>
    </form>
  );
}

// --- calls -----------------------------------------------------------------

function CallsTab() {
  const can = useCan();
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [direction, setDirection] = useState<CallDirection | ''>('');
  const [dueOnly, setDueOnly] = useState(false);
  const [adding, setAdding] = useState(false);
  const debounced = useDebounced(q, 300);

  const calls = useQuery({
    queryKey: ['frontoffice', 'calls', debounced, direction, dueOnly],
    queryFn: async () => {
      const { data } = await api.get<PhoneCall[]>('/front-office/calls', {
        params: {
          ...(debounced ? { q: debounced } : {}),
          ...(direction ? { direction } : {}),
          ...(dueOnly ? { dueOnly: 'true' } : {}),
        },
      });
      return data;
    },
  });

  return (
    <div>
      <div className="toolbar">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search caller, phone or purpose"
          aria-label="Search calls"
        />
        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value as CallDirection | '')}
          aria-label="Direction"
        >
          <option value="">Both ways</option>
          {DIRECTIONS.map((d) => (
            <option key={d} value={d}>{CALL_DIRECTION_LABELS[d]}</option>
          ))}
        </select>
        <label style={inlineLabel}>
          <input
            type="checkbox"
            checked={dueOnly}
            onChange={(e) => setDueOnly(e.target.checked)}
          />
          Follow-up due
        </label>
        {can('frontoffice:manage') && (
          <button type="button" onClick={() => setAdding((v) => !v)}>
            {adding ? 'Close' : 'Log a call'}
          </button>
        )}
      </div>

      {adding && can('frontoffice:manage') && (
        <PhoneCallForm
          onDone={async () => {
            setAdding(false);
            await queryClient.invalidateQueries({ queryKey: ['frontoffice', 'calls'] });
          }}
        />
      )}

      <ErrorNote error={calls.error} fallback="Could not load the call log" />
      {calls.isPending && <Loading label="Loading calls…" />}
      {calls.data?.length === 0 && <p className="muted">No calls match this filter.</p>}

      {!!calls.data?.length && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Direction</th>
                <th>Caller</th>
                <th>About</th>
                <th>Purpose</th>
                <th>Outcome</th>
                <th>Follow up</th>
                <th>Logged by</th>
              </tr>
            </thead>
            <tbody>
              {calls.data.map((c) => (
                <tr key={c.id}>
                  <td>{formatDateTime(c.calledAt)}</td>
                  <td>
                    <StatusBadge
                      status={c.direction}
                      label={CALL_DIRECTION_LABELS[c.direction]}
                    />
                  </td>
                  <td>
                    {c.callerName}
                    {c.phone ? ` · ${c.phone}` : ''}
                  </td>
                  <td>
                    {c.patient
                      ? `${c.patient.mrn} — ${c.patient.firstName} ${c.patient.lastName}`
                      : '—'}
                  </td>
                  <td>{c.purpose ?? '—'}</td>
                  <td>{c.outcome ?? '—'}</td>
                  <td>{c.followUpOn ? formatDate(c.followUpOn) : '—'}</td>
                  <td>{c.recordedBy ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PhoneCallForm({ onDone }: { onDone: () => Promise<void> }) {
  const [formErr, setFormErr] = useState<string | null>(null);
  const [patientQ, setPatientQ] = useState('');
  const [chosenPatient, setChosenPatient] = useState<Patient | null>(null);
  const patients = usePatientLookup(patientQ);

  const [form, setForm] = useState({
    direction: 'incoming' as CallDirection,
    callerName: '',
    phone: '',
    patientId: '',
    purpose: '',
    durationMinutes: '',
    outcome: '',
    followUpOn: '',
    note: '',
  });

  const create = useMutation({
    mutationFn: async (payload: CreatePhoneCallInput) => {
      const { data } = await api.post<PhoneCall>('/front-office/calls', payload);
      return data;
    },
    onSuccess: onDone,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    const parsed = createPhoneCallSchema.safeParse({
      direction: form.direction,
      callerName: form.callerName,
      phone: blankToUndefined(form.phone),
      patientId: blankToUndefined(form.patientId),
      purpose: blankToUndefined(form.purpose),
      durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : undefined,
      outcome: blankToUndefined(form.outcome),
      followUpOn: blankToUndefined(form.followUpOn),
      note: blankToUndefined(form.note),
    });
    if (!parsed.success) {
      setFormErr(zodMessage(parsed.error));
      return;
    }
    create.mutate(parsed.data);
  };

  return (
    <form className="card" onSubmit={submit}>
      <h2>Log a call</h2>
      <div className="grid">
        <label>
          Direction
          <select
            value={form.direction}
            onChange={(e) =>
              setForm((f) => ({ ...f, direction: e.target.value as CallDirection }))
            }
          >
            {DIRECTIONS.map((d) => (
              <option key={d} value={d}>{CALL_DIRECTION_LABELS[d]}</option>
            ))}
          </select>
        </label>
        <label>
          Caller
          <input
            value={form.callerName}
            onChange={(e) => setForm((f) => ({ ...f, callerName: e.target.value }))}
            required
          />
        </label>
        <label>
          Phone
          <input
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            placeholder="+923001234567"
          />
        </label>
        <label>
          Duration (minutes)
          <input
            type="number"
            min="0"
            max="600"
            value={form.durationMinutes}
            onChange={(e) => setForm((f) => ({ ...f, durationMinutes: e.target.value }))}
          />
        </label>
        <label>
          Follow up on
          <input
            type="date"
            value={form.followUpOn}
            onChange={(e) => setForm((f) => ({ ...f, followUpOn: e.target.value }))}
          />
        </label>
      </div>

      <SearchSelect
        label="About a patient"
        placeholder="Search patients"
        query={patientQ}
        onQueryChange={setPatientQ}
        items={patients.data ?? []}
        isLoading={patients.isFetching}
        error={patients.error}
        emptyLabel="No patient matches"
        getKey={(p) => p.id}
        renderItem={(p) => (
          <>
            <div>
              {p.mrn} — {p.firstName} {p.lastName}
            </div>
            <div className="muted">{p.phone}</div>
          </>
        )}
        onSelect={(p) => {
          setForm((f) => ({ ...f, patientId: p.id }));
          setChosenPatient(p);
        }}
      />
      {chosenPatient && (
        <p className="muted">
          About <strong>{chosenPatient.firstName} {chosenPatient.lastName}</strong>{' '}
          ({chosenPatient.mrn}).
        </p>
      )}

      <label>
        Purpose
        <input
          value={form.purpose}
          onChange={(e) => setForm((f) => ({ ...f, purpose: e.target.value }))}
        />
      </label>
      <label>
        Outcome — what they were told, or what still needs doing
        <textarea
          value={form.outcome}
          onChange={(e) => setForm((f) => ({ ...f, outcome: e.target.value }))}
          rows={2}
        />
      </label>

      {formErr && <div className="alert" role="alert">{formErr}</div>}
      <ErrorNote error={create.error} fallback="Could not log this call" />
      <div className="actions">
        <button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Saving…' : 'Log call'}
        </button>
      </div>
    </form>
  );
}

// --- postal ----------------------------------------------------------------

function PostalTab() {
  const can = useCan();
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [direction, setDirection] = useState<PostalDirection | ''>('');
  const [adding, setAdding] = useState(false);
  const debounced = useDebounced(q, 300);

  const items = useQuery({
    queryKey: ['frontoffice', 'postal', debounced, direction],
    queryFn: async () => {
      const { data } = await api.get<PostalItem[]>('/front-office/postal', {
        params: {
          ...(debounced ? { q: debounced } : {}),
          ...(direction ? { direction } : {}),
        },
      });
      return data;
    },
  });

  return (
    <div>
      <div className="toolbar">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search party, reference or tracking"
          aria-label="Search postal register"
        />
        <select
          value={direction}
          onChange={(e) => setDirection(e.target.value as PostalDirection | '')}
          aria-label="Direction"
        >
          <option value="">In and out</option>
          {POSTAL_DIRECTIONS.map((d) => (
            <option key={d} value={d}>{POSTAL_DIRECTION_LABELS[d]}</option>
          ))}
        </select>
        {can('frontoffice:manage') && (
          <button type="button" onClick={() => setAdding((v) => !v)}>
            {adding ? 'Close' : 'Add an entry'}
          </button>
        )}
      </div>

      {adding && can('frontoffice:manage') && (
        <PostalForm
          onDone={async () => {
            setAdding(false);
            await queryClient.invalidateQueries({ queryKey: ['frontoffice', 'postal'] });
          }}
        />
      )}

      <ErrorNote error={items.error} fallback="Could not load the postal register" />
      {items.isPending && <Loading label="Loading postal register…" />}
      {items.data?.length === 0 && <p className="muted">No entries match this filter.</p>}

      {!!items.data?.length && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Direction</th>
                <th>Party</th>
                <th>For</th>
                <th>Reference</th>
                <th>Courier</th>
                <th>Tracking</th>
                <th>Logged by</th>
              </tr>
            </thead>
            <tbody>
              {items.data.map((i) => (
                <tr key={i.id}>
                  <td>{formatDate(i.onDate)}</td>
                  <td>
                    <StatusBadge
                      status={i.direction}
                      label={POSTAL_DIRECTION_LABELS[i.direction]}
                    />
                  </td>
                  <td>{i.party}</td>
                  <td>{i.addressedTo ?? '—'}</td>
                  <td>{i.reference ?? '—'}</td>
                  <td>{i.courier ?? '—'}</td>
                  <td>{i.trackingNo ?? '—'}</td>
                  <td>{i.recordedBy ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PostalForm({ onDone }: { onDone: () => Promise<void> }) {
  const [formErr, setFormErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    direction: 'received' as PostalDirection,
    party: '',
    addressedTo: '',
    reference: '',
    courier: '',
    trackingNo: '',
    onDate: todayIsoDate(),
    note: '',
  });

  const create = useMutation({
    mutationFn: async (payload: CreatePostalItemInput) => {
      const { data } = await api.post<PostalItem>('/front-office/postal', payload);
      return data;
    },
    onSuccess: onDone,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    const parsed = createPostalItemSchema.safeParse({
      direction: form.direction,
      party: form.party,
      addressedTo: blankToUndefined(form.addressedTo),
      reference: blankToUndefined(form.reference),
      courier: blankToUndefined(form.courier),
      trackingNo: blankToUndefined(form.trackingNo),
      onDate: form.onDate,
      note: blankToUndefined(form.note),
    });
    if (!parsed.success) {
      setFormErr(zodMessage(parsed.error));
      return;
    }
    create.mutate(parsed.data);
  };

  return (
    <form className="card" onSubmit={submit}>
      <h2>Postal entry</h2>
      <div className="grid">
        <label>
          Direction
          <select
            value={form.direction}
            onChange={(e) =>
              setForm((f) => ({ ...f, direction: e.target.value as PostalDirection }))
            }
          >
            {POSTAL_DIRECTIONS.map((d) => (
              <option key={d} value={d}>{POSTAL_DIRECTION_LABELS[d]}</option>
            ))}
          </select>
        </label>
        <label>
          {form.direction === 'received' ? 'From' : 'To'}
          <input
            value={form.party}
            onChange={(e) => setForm((f) => ({ ...f, party: e.target.value }))}
            required
          />
        </label>
        <label>
          Addressed to
          <input
            value={form.addressedTo}
            onChange={(e) => setForm((f) => ({ ...f, addressedTo: e.target.value }))}
            placeholder="Department or person"
          />
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
          Reference
          <input
            value={form.reference}
            onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
          />
        </label>
        <label>
          Courier
          <input
            value={form.courier}
            onChange={(e) => setForm((f) => ({ ...f, courier: e.target.value }))}
          />
        </label>
        <label>
          Tracking number
          <input
            value={form.trackingNo}
            onChange={(e) => setForm((f) => ({ ...f, trackingNo: e.target.value }))}
          />
        </label>
      </div>

      {formErr && <div className="alert" role="alert">{formErr}</div>}
      <ErrorNote error={create.error} fallback="Could not save this entry" />
      <div className="actions">
        <button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Saving…' : 'Save entry'}
        </button>
      </div>
    </form>
  );
}

// --- complaints ------------------------------------------------------------

interface ComplaintSummary {
  open: number;
  inProgress: number;
  resolved: number;
  closed: number;
  averageDaysToResolve: number | null;
  oldestOpenDays: number | null;
}

function ComplaintsTab() {
  const can = useCan();
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<ComplaintStatus | ''>('');
  const [openOnly, setOpenOnly] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Complaint | null>(null);
  const debounced = useDebounced(q, 300);

  const summary = useQuery({
    queryKey: ['frontoffice', 'complaints', 'summary'],
    queryFn: async () => {
      const { data } = await api.get<ComplaintSummary>(
        '/front-office/complaints/summary',
      );
      return data;
    },
  });

  const complaints = useQuery({
    queryKey: ['frontoffice', 'complaints', debounced, status, openOnly],
    queryFn: async () => {
      const { data } = await api.get<Complaint[]>('/front-office/complaints', {
        params: {
          ...(debounced ? { q: debounced } : {}),
          ...(status ? { status } : {}),
          ...(openOnly && !status ? { openOnly: 'true' } : {}),
        },
      });
      return data;
    },
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['frontoffice', 'complaints'] });
  };

  return (
    <div>
      {summary.data && (
        <div className="card">
          <p>
            <strong>{summary.data.open}</strong> open · {summary.data.inProgress} in
            progress · {summary.data.resolved} resolved · {summary.data.closed} closed
          </p>
          <p className="muted">
            {summary.data.averageDaysToResolve === null
              ? 'Nothing resolved yet.'
              : `Average ${summary.data.averageDaysToResolve} days to resolve.`}
            {summary.data.oldestOpenDays !== null &&
              ` Oldest still open: ${summary.data.oldestOpenDays} days.`}
          </p>
        </div>
      )}

      <div className="toolbar">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search reference, name or description"
          aria-label="Search complaints"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as ComplaintStatus | '')}
          aria-label="Status"
        >
          <option value="">Any status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{COMPLAINT_STATUS_LABELS[s]}</option>
          ))}
        </select>
        {!status && (
          <label style={inlineLabel}>
            <input
              type="checkbox"
              checked={openOnly}
              onChange={(e) => setOpenOnly(e.target.checked)}
            />
            Still open
          </label>
        )}
        {can('complaint:manage') && (
          <button type="button" onClick={() => setAdding((v) => !v)}>
            {adding ? 'Close' : 'Record a complaint'}
          </button>
        )}
      </div>

      {adding && can('complaint:manage') && (
        <ComplaintForm
          onDone={async () => {
            setAdding(false);
            await invalidate();
          }}
        />
      )}

      {editing && can('complaint:manage') && (
        <ComplaintUpdateForm
          complaint={editing}
          onDone={async () => {
            setEditing(null);
            await invalidate();
          }}
          onCancel={() => setEditing(null)}
        />
      )}

      <ErrorNote error={complaints.error} fallback="Could not load complaints" />
      {complaints.isPending && <Loading label="Loading complaints…" />}
      {complaints.data?.length === 0 && (
        <p className="muted">No complaints match this filter.</p>
      )}

      {!!complaints.data?.length && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Reference</th>
                <th>From</th>
                <th>About</th>
                <th>Severity</th>
                <th>Status</th>
                <th>Assigned to</th>
                <th className="num">Age</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {complaints.data.map((c) => (
                <tr key={c.id}>
                  <td>{c.reference}</td>
                  <td>
                    {c.complainantName}
                    {c.patient && (
                      <div className="muted">
                        {c.patient.mrn} — {c.patient.firstName} {c.patient.lastName}
                      </div>
                    )}
                  </td>
                  <td>
                    {c.about ?? '—'}
                    <div className="muted">{c.description}</div>
                  </td>
                  <td>
                    <StatusBadge
                      status={c.severity}
                      label={COMPLAINT_SEVERITY_LABELS[c.severity]}
                    />
                  </td>
                  <td>
                    <StatusBadge
                      status={c.status}
                      label={COMPLAINT_STATUS_LABELS[c.status]}
                    />
                    {c.resolution && <div className="muted">{c.resolution}</div>}
                  </td>
                  <td>{c.assignedTo ?? '—'}</td>
                  <td className="num">
                    {c.ageDays} day{c.ageDays === 1 ? '' : 's'}
                  </td>
                  <td>
                    {can('complaint:manage') && (
                      <button type="button" onClick={() => setEditing(c)}>
                        Update
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

function ComplaintForm({ onDone }: { onDone: () => Promise<void> }) {
  const [formErr, setFormErr] = useState<string | null>(null);
  const [patientQ, setPatientQ] = useState('');
  const [chosenPatient, setChosenPatient] = useState<Patient | null>(null);
  const patients = usePatientLookup(patientQ);

  const [form, setForm] = useState({
    complainantName: '',
    phone: '',
    patientId: '',
    about: '',
    severity: 'medium' as ComplaintSeverity,
    description: '',
  });

  const create = useMutation({
    mutationFn: async (payload: CreateComplaintInput) => {
      const { data } = await api.post<Complaint>('/front-office/complaints', payload);
      return data;
    },
    onSuccess: onDone,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    const parsed = createComplaintSchema.safeParse({
      complainantName: form.complainantName,
      phone: blankToUndefined(form.phone),
      patientId: blankToUndefined(form.patientId),
      about: blankToUndefined(form.about),
      severity: form.severity,
      description: form.description,
    });
    if (!parsed.success) {
      setFormErr(zodMessage(parsed.error));
      return;
    }
    create.mutate(parsed.data);
  };

  return (
    <form className="card" onSubmit={submit}>
      <h2>Record a complaint</h2>
      <div className="grid">
        <label>
          Complainant
          <input
            value={form.complainantName}
            onChange={(e) =>
              setForm((f) => ({ ...f, complainantName: e.target.value }))
            }
            required
          />
        </label>
        <label>
          Phone
          <input
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            placeholder="+923001234567"
          />
        </label>
        <label>
          About
          <input
            value={form.about}
            onChange={(e) => setForm((f) => ({ ...f, about: e.target.value }))}
            placeholder="Department, ward or service"
          />
        </label>
        <label>
          Severity
          <select
            value={form.severity}
            onChange={(e) =>
              setForm((f) => ({ ...f, severity: e.target.value as ComplaintSeverity }))
            }
          >
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>{COMPLAINT_SEVERITY_LABELS[s]}</option>
            ))}
          </select>
        </label>
      </div>

      <SearchSelect
        label="About a patient"
        placeholder="Search patients"
        query={patientQ}
        onQueryChange={setPatientQ}
        items={patients.data ?? []}
        isLoading={patients.isFetching}
        error={patients.error}
        emptyLabel="No patient matches"
        getKey={(p) => p.id}
        renderItem={(p) => (
          <>
            <div>
              {p.mrn} — {p.firstName} {p.lastName}
            </div>
            <div className="muted">{p.phone}</div>
          </>
        )}
        onSelect={(p) => {
          setForm((f) => ({ ...f, patientId: p.id }));
          setChosenPatient(p);
        }}
      />
      {chosenPatient && (
        <p className="muted">
          About <strong>{chosenPatient.firstName} {chosenPatient.lastName}</strong>{' '}
          ({chosenPatient.mrn}).
        </p>
      )}

      <label>
        What happened
        <textarea
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          rows={3}
          required
        />
      </label>

      {formErr && <div className="alert" role="alert">{formErr}</div>}
      <ErrorNote error={create.error} fallback="Could not record this complaint" />
      <div className="actions">
        <button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Saving…' : 'Record complaint'}
        </button>
      </div>
    </form>
  );
}

function ComplaintUpdateForm({
  complaint,
  onDone,
  onCancel,
}: {
  complaint: Complaint;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const [formErr, setFormErr] = useState<string | null>(null);
  const [status, setStatus] = useState<ComplaintStatus>(complaint.status);
  const [severity, setSeverity] = useState<ComplaintSeverity>(complaint.severity);
  const [resolution, setResolution] = useState(complaint.resolution ?? '');

  // Derived during render: the resolution box becomes required the moment the
  // chosen status is one that means the complaint is finished.
  const needsResolution = requiresResolution(status);

  const save = useMutation({
    mutationFn: async () => {
      const body = updateComplaintSchema.parse({
        status,
        severity,
        resolution: resolution.trim() ? resolution : null,
      });
      const { data } = await api.patch<Complaint>(
        `/front-office/complaints/${complaint.id}`,
        body,
      );
      return data;
    },
    onSuccess: onDone,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    if (needsResolution && !resolution.trim()) {
      setFormErr('Write down what was done before marking this resolved');
      return;
    }
    save.mutate();
  };

  return (
    <form className="card" onSubmit={submit}>
      <h2>{complaint.reference}</h2>
      <p className="muted">{complaint.description}</p>

      <div className="toolbar">
        <label style={inlineLabel}>
          Status
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ComplaintStatus)}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{COMPLAINT_STATUS_LABELS[s]}</option>
            ))}
          </select>
        </label>
        <label style={inlineLabel}>
          Severity
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as ComplaintSeverity)}
          >
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>{COMPLAINT_SEVERITY_LABELS[s]}</option>
            ))}
          </select>
        </label>
      </div>

      <label>
        What was done{needsResolution ? ' (required)' : ''}
        <textarea
          value={resolution}
          onChange={(e) => setResolution(e.target.value)}
          rows={3}
          required={needsResolution}
        />
      </label>
      {needsResolution && (
        <p className="muted">
          A status alone records that a complaint stopped being tracked, which is
          not the same as it being dealt with.
        </p>
      )}

      {formErr && <div className="alert" role="alert">{formErr}</div>}
      <ErrorNote error={save.error} fallback="Could not update this complaint" />
      <div className="actions">
        <button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
