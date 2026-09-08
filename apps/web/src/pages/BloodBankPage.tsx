import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BLOOD_COMPONENT_LABELS,
  BLOOD_GROUPS,
  BLOOD_UNIT_STATUS_LABELS,
  COMPONENT_SHELF_LIFE_DAYS,
  bloodComponentSchema,
  bloodUnitStatusSchema,
  compatibleDonorGroups,
  createDonorSchema,
  discardUnitSchema,
  formatMoney,
  incompatibilityReason,
  issueBloodSchema,
  recordDonationSchema,
  toMinor,
  type BloodComponent,
  type BloodGroup,
  type BloodIssue,
  type BloodStock,
  type BloodUnit,
  type BloodUnitStatus,
  type CreateDonorInput,
  type Donor,
  type IssueBloodInput,
  type Paginated,
  type Patient,
  type RecordDonationInput,
} from '@hms/shared';
import { api } from '../lib/api';
import { useCan } from '../lib/permissions';
import { num } from '../lib/bill-line';
import { blankToUndefined, formatDate, formatDateTime, todayIsoDate } from '../lib/format';
import { ErrorNote, Loading } from '../components/QueryFeedback';
import { StatusBadge } from '../components/StatusBadge';
import { Tabs, type TabDef } from '../components/Tabs';
import { SearchSelect } from '../components/SearchSelect';
import { useDebounced } from '../lib/useDebounced';

type TabValue = 'stock' | 'units' | 'donors' | 'issues';

const TABS: readonly TabDef<TabValue>[] = [
  { value: 'stock', label: 'Stock' },
  { value: 'units', label: 'Units' },
  { value: 'donors', label: 'Donors' },
  { value: 'issues', label: 'Issued' },
];

const COMPONENTS = bloodComponentSchema.options;
const STATUSES = bloodUnitStatusSchema.options;

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

/** YYYY-MM-DD, n days from today. */
function datePlus(days: number): string {
  const d = new Date(`${todayIsoDate()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function BloodBankPage() {
  const [tab, setTab] = useState<TabValue>('stock');

  return (
    <section>
      <h1>Blood bank</h1>
      <Tabs tabs={TABS} value={tab} onChange={setTab} ariaLabel="Blood bank sections" />
      {tab === 'stock' && <StockTab />}
      {tab === 'units' && <UnitsTab />}
      {tab === 'donors' && <DonorsTab />}
      {tab === 'issues' && <IssuesTab />}
    </section>
  );
}

// --- stock -----------------------------------------------------------------

function StockTab() {
  const stock = useQuery({
    queryKey: ['blood', 'stock'],
    queryFn: async () => {
      const { data } = await api.get<BloodStock>('/blood/stock');
      return data;
    },
  });

  if (stock.isPending) return <Loading label="Counting the shelf…" />;
  if (stock.error) {
    return <ErrorNote error={stock.error} fallback="Could not load the stock board" />;
  }
  if (!stock.data) return null;

  const { totals, byGroup } = stock.data;

  return (
    <div>
      <div className="card">
        <p>
          <strong>{totals.available}</strong> available · {totals.issued} issued ·{' '}
          {totals.expired} expired · {totals.discarded} discarded
          {totals.expiringSoon > 0 && (
            <>
              {' '}
              — <strong>{totals.expiringSoon} expiring within 7 days</strong>
            </>
          )}
        </p>
        <p className="muted">
          Counted from the bags themselves each time, so this cannot disagree with
          the fridge.
        </p>
      </div>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Group</th>
              <th className="num">Available</th>
              <th className="num">Expiring soon</th>
              {COMPONENTS.map((c) => (
                <th key={c} className="num">
                  {BLOOD_COMPONENT_LABELS[c]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {byGroup.map((g) => (
              <tr key={g.bloodGroup}>
                <td>
                  <strong>{g.bloodGroup}</strong>
                </td>
                <td className="num">
                  {g.available === 0 ? (
                    <StatusBadge status="empty" label="0" />
                  ) : (
                    g.available
                  )}
                </td>
                <td className="num">{g.expiringSoon || '—'}</td>
                {g.byComponent.map((c) => (
                  <td key={c.component} className="num">
                    {c.available || '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">
        Every group is listed even at zero — an empty shelf is the thing a blood
        bank most needs to see.
      </p>
    </div>
  );
}

// --- units -----------------------------------------------------------------

function UnitsTab() {
  const can = useCan();
  const queryClient = useQueryClient();
  const [bloodGroup, setBloodGroup] = useState<BloodGroup | ''>('');
  const [status, setStatus] = useState<BloodUnitStatus | ''>('available');
  const [collecting, setCollecting] = useState(false);

  const units = useQuery({
    queryKey: ['blood', 'units', bloodGroup, status],
    queryFn: async () => {
      const { data } = await api.get<BloodUnit[]>('/blood/units', {
        params: {
          ...(bloodGroup ? { bloodGroup } : {}),
          ...(status ? { status } : {}),
        },
      });
      return data;
    },
  });

  const discard = useMutation({
    mutationFn: async (input: { id: string; reason: string }) => {
      const body = discardUnitSchema.parse({ reason: input.reason });
      const { data } = await api.post<BloodUnit>(
        `/blood/units/${input.id}/discard`,
        body,
      );
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['blood'] });
    },
  });

  return (
    <div>
      <div className="toolbar">
        <select
          value={bloodGroup}
          onChange={(e) => setBloodGroup(e.target.value as BloodGroup | '')}
          aria-label="Blood group"
        >
          <option value="">All groups</option>
          {BLOOD_GROUPS.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as BloodUnitStatus | '')}
          aria-label="Status"
        >
          <option value="">Any status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{BLOOD_UNIT_STATUS_LABELS[s]}</option>
          ))}
        </select>
        {can('blood:collect') && (
          <button type="button" onClick={() => setCollecting((v) => !v)}>
            {collecting ? 'Close' : 'Record a donation'}
          </button>
        )}
      </div>

      {collecting && can('blood:collect') && (
        <DonationForm
          onDone={async () => {
            setCollecting(false);
            await queryClient.invalidateQueries({ queryKey: ['blood'] });
          }}
        />
      )}

      <ErrorNote error={units.error} fallback="Could not load the units" />
      <ErrorNote error={discard.error} fallback="Could not discard that unit" />
      {units.isPending && <Loading label="Loading units…" />}
      {units.data?.length === 0 && (
        <p className="muted">No bags match this filter.</p>
      )}

      {!!units.data?.length && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Bag no.</th>
                <th>Group</th>
                <th>Component</th>
                <th>Collected</th>
                <th>Expires</th>
                <th>Donor</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {units.data.map((u) => (
                <tr key={u.id}>
                  <td>{u.bagNo}</td>
                  <td><strong>{u.bloodGroup}</strong></td>
                  <td>{BLOOD_COMPONENT_LABELS[u.component]}</td>
                  <td>{formatDate(u.collectedOn)}</td>
                  <td>{formatDate(u.expiresOn)}</td>
                  <td>{u.donor ? `${u.donor.donorNo} — ${u.donor.name}` : '—'}</td>
                  <td>
                    <StatusBadge
                      status={u.status}
                      label={BLOOD_UNIT_STATUS_LABELS[u.status]}
                    />
                    {u.screeningPassed === false && ' failed screening'}
                  </td>
                  <td>
                    {can('blood:discard') && u.status === 'available' && (
                      <button
                        type="button"
                        disabled={discard.isPending}
                        onClick={() => {
                          const reason = window.prompt('Why is this bag being discarded?');
                          if (reason?.trim()) {
                            discard.mutate({ id: u.id, reason: reason.trim() });
                          }
                        }}
                      >
                        Discard
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

function DonationForm({ onDone }: { onDone: () => Promise<void> }) {
  const [formErr, setFormErr] = useState<string | null>(null);
  const [donorQ, setDonorQ] = useState('');
  const [chosenDonor, setChosenDonor] = useState<Donor | null>(null);
  const debounced = useDebounced(donorQ, 300);
  const [form, setForm] = useState({
    donorId: '',
    bagNo: '',
    component: 'whole_blood' as BloodComponent,
    collectedOn: todayIsoDate(),
    expiresOn: datePlus(COMPONENT_SHELF_LIFE_DAYS.whole_blood),
    volumeMl: '450',
    screeningPassed: true,
    note: '',
  });

  const donors = useQuery({
    queryKey: ['blood', 'donors', 'lookup', debounced],
    queryFn: async () => {
      const { data } = await api.get<Donor[]>('/blood/donors', {
        params: { eligibleOnly: 'true', ...(debounced ? { q: debounced } : {}) },
      });
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async (payload: RecordDonationInput) => {
      const { data } = await api.post<BloodUnit>('/blood/units', payload);
      return data;
    },
    onSuccess: onDone,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    const parsed = recordDonationSchema.safeParse({
      donorId: form.donorId,
      bagNo: form.bagNo,
      component: form.component,
      collectedOn: form.collectedOn,
      expiresOn: form.expiresOn,
      volumeMl: form.volumeMl ? Number(form.volumeMl) : undefined,
      screenedAt: new Date().toISOString(),
      screeningPassed: form.screeningPassed,
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
      <h2>Record a donation</h2>
      <p className="muted">
        Only donors past their 90-day interval are listed. The bag takes the
        donor's group — it is never typed in again.
      </p>

      <div className="grid">
        <SearchSelect
          label="Donor"
          placeholder="Search donors"
          query={donorQ}
          onQueryChange={setDonorQ}
          items={donors.data ?? []}
          isLoading={donors.isFetching}
          error={donors.error}
          emptyLabel="No eligible donor matches"
          getKey={(d) => d.id}
          renderItem={(d) => (
            <>
              <div>
                {d.donorNo} — {d.firstName} {d.lastName}
              </div>
              <div className="muted">
                {d.bloodGroup} · {d.donationCount} donation
                {d.donationCount === 1 ? '' : 's'}
              </div>
            </>
          )}
          onSelect={(d) => {
            setForm((f) => ({ ...f, donorId: d.id }));
            setChosenDonor(d);
          }}
        />
        {chosenDonor && (
          <p className="muted">
            Collecting from <strong>{chosenDonor.firstName} {chosenDonor.lastName}</strong> —
            the bag will be recorded as <strong>{chosenDonor.bloodGroup}</strong>.
          </p>
        )}
        <label>
          Bag number
          <input
            value={form.bagNo}
            onChange={(e) => setForm((f) => ({ ...f, bagNo: e.target.value }))}
            required
          />
        </label>
        <label>
          Component
          <select
            value={form.component}
            onChange={(e) => {
              const c = e.target.value as BloodComponent;
              setForm((f) => ({
                ...f,
                component: c,
                // Move the expiry with the component, but it stays editable —
                // the real shelf life depends on how the bag was processed.
                expiresOn: datePlus(COMPONENT_SHELF_LIFE_DAYS[c]),
              }));
            }}
          >
            {COMPONENTS.map((c) => (
              <option key={c} value={c}>{BLOOD_COMPONENT_LABELS[c]}</option>
            ))}
          </select>
        </label>
        <label>
          Collected on
          <input
            type="date"
            value={form.collectedOn}
            onChange={(e) => setForm((f) => ({ ...f, collectedOn: e.target.value }))}
            required
          />
        </label>
        <label>
          Expires on
          <input
            type="date"
            value={form.expiresOn}
            onChange={(e) => setForm((f) => ({ ...f, expiresOn: e.target.value }))}
            required
          />
        </label>
        <label>
          Volume (ml)
          <input
            type="number"
            min="1"
            max="1000"
            value={form.volumeMl}
            onChange={(e) => setForm((f) => ({ ...f, volumeMl: e.target.value }))}
          />
        </label>
      </div>

      <label style={inlineLabel}>
        <input
          type="checkbox"
          checked={form.screeningPassed}
          onChange={(e) => setForm((f) => ({ ...f, screeningPassed: e.target.checked }))}
        />
        Screening passed
      </label>
      <p className="muted">
        A bag recorded as failing screening can never be issued.
      </p>

      {formErr && <div className="alert" role="alert">{formErr}</div>}
      <ErrorNote error={create.error} fallback="Could not record this donation" />
      <div className="actions">
        <button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Saving…' : 'Record donation'}
        </button>
      </div>
    </form>
  );
}

// --- donors ----------------------------------------------------------------

function DonorsTab() {
  const can = useCan();
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [bloodGroup, setBloodGroup] = useState<BloodGroup | ''>('');
  const [eligibleOnly, setEligibleOnly] = useState(false);
  const [adding, setAdding] = useState(false);
  const debounced = useDebounced(q, 300);

  const donors = useQuery({
    queryKey: ['blood', 'donors', 'list', debounced, bloodGroup, eligibleOnly],
    queryFn: async () => {
      const { data } = await api.get<Donor[]>('/blood/donors', {
        params: {
          ...(debounced ? { q: debounced } : {}),
          ...(bloodGroup ? { bloodGroup } : {}),
          ...(eligibleOnly ? { eligibleOnly: 'true' } : {}),
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
          placeholder="Search name, number or phone"
          aria-label="Search donors"
        />
        <select
          value={bloodGroup}
          onChange={(e) => setBloodGroup(e.target.value as BloodGroup | '')}
          aria-label="Blood group"
        >
          <option value="">All groups</option>
          {BLOOD_GROUPS.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
        <label style={inlineLabel}>
          <input
            type="checkbox"
            checked={eligibleOnly}
            onChange={(e) => setEligibleOnly(e.target.checked)}
          />
          Only those who may give today
        </label>
        {can('donor:manage') && (
          <button type="button" onClick={() => setAdding((v) => !v)}>
            {adding ? 'Close' : 'Add donor'}
          </button>
        )}
      </div>

      {adding && can('donor:manage') && (
        <DonorForm
          onDone={async () => {
            setAdding(false);
            await queryClient.invalidateQueries({ queryKey: ['blood', 'donors'] });
          }}
        />
      )}

      <ErrorNote error={donors.error} fallback="Could not load the donors" />
      {donors.isPending && <Loading label="Loading donors…" />}
      {donors.data?.length === 0 && <p className="muted">No donors match this filter.</p>}

      {!!donors.data?.length && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Donor no.</th>
                <th>Name</th>
                <th>Group</th>
                <th>Phone</th>
                <th className="num">Donations</th>
                <th>Last gave</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {donors.data.map((d) => (
                <tr key={d.id}>
                  <td>{d.donorNo}</td>
                  <td>{d.firstName} {d.lastName}</td>
                  <td><strong>{d.bloodGroup}</strong></td>
                  <td>{d.phone}</td>
                  <td className="num">{d.donationCount}</td>
                  <td>{d.lastDonatedOn ? formatDate(d.lastDonatedOn) : 'Never'}</td>
                  <td>
                    {d.isDeferred ? (
                      <>
                        <StatusBadge status="deferred" label="Deferred" />{' '}
                        {d.eligibleFrom && `until ${formatDate(d.eligibleFrom)}`}
                      </>
                    ) : (
                      <StatusBadge status="available" label="May give" />
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

function DonorForm({ onDone }: { onDone: () => Promise<void> }) {
  const [formErr, setFormErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    bloodGroup: 'O+' as BloodGroup,
    phone: '',
    birthDate: '',
    address: '',
    note: '',
  });

  const create = useMutation({
    mutationFn: async (payload: CreateDonorInput) => {
      const { data } = await api.post<Donor>('/blood/donors', payload);
      return data;
    },
    onSuccess: onDone,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    const parsed = createDonorSchema.safeParse({
      firstName: form.firstName,
      lastName: form.lastName,
      bloodGroup: form.bloodGroup,
      phone: form.phone,
      birthDate: blankToUndefined(form.birthDate),
      address: blankToUndefined(form.address),
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
      <h2>Add donor</h2>
      <div className="grid">
        <label>
          First name
          <input
            value={form.firstName}
            onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
            required
          />
        </label>
        <label>
          Last name
          <input
            value={form.lastName}
            onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
            required
          />
        </label>
        <label>
          Blood group
          <select
            value={form.bloodGroup}
            onChange={(e) => setForm((f) => ({ ...f, bloodGroup: e.target.value as BloodGroup }))}
          >
            {BLOOD_GROUPS.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </label>
        <label>
          Phone
          <input
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            required
          />
        </label>
        <label>
          Date of birth
          <input
            type="date"
            value={form.birthDate}
            onChange={(e) => setForm((f) => ({ ...f, birthDate: e.target.value }))}
          />
        </label>
      </div>
      <label>
        Address
        <textarea
          value={form.address}
          onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
          rows={2}
        />
      </label>

      {formErr && <div className="alert" role="alert">{formErr}</div>}
      <ErrorNote error={create.error} fallback="Could not add this donor" />
      <div className="actions">
        <button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Saving…' : 'Add donor'}
        </button>
      </div>
    </form>
  );
}

// --- issuing ---------------------------------------------------------------

function IssuesTab() {
  const can = useCan();
  const queryClient = useQueryClient();
  const [issuing, setIssuing] = useState(false);

  const issues = useQuery({
    queryKey: ['blood', 'issues', 'list'],
    queryFn: async () => {
      const { data } = await api.get<BloodIssue[]>('/blood/issues');
      return data;
    },
  });

  return (
    <div>
      {can('blood:issue') && (
        <div className="toolbar">
          <button type="button" onClick={() => setIssuing((v) => !v)}>
            {issuing ? 'Close' : 'Issue a unit'}
          </button>
        </div>
      )}

      {issuing && can('blood:issue') && (
        <IssueForm
          onDone={async () => {
            setIssuing(false);
            await queryClient.invalidateQueries({ queryKey: ['blood'] });
          }}
        />
      )}

      <ErrorNote error={issues.error} fallback="Could not load the issue log" />
      {issues.isPending && <Loading label="Loading issued units…" />}
      {issues.data?.length === 0 && <p className="muted">Nothing has been issued yet.</p>}

      {!!issues.data?.length && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Issued</th>
                <th>Bag no.</th>
                <th>Unit group</th>
                <th>Patient</th>
                <th>Patient group</th>
                <th>Component</th>
                <th>Cross-matched by</th>
                <th>Issued by</th>
              </tr>
            </thead>
            <tbody>
              {issues.data.map((i) => (
                <tr key={i.id}>
                  <td>{formatDateTime(i.issuedAt)}</td>
                  <td>{i.unit.bagNo}</td>
                  <td><strong>{i.unit.bloodGroup}</strong></td>
                  <td>{i.patient.mrn} — {i.patient.firstName} {i.patient.lastName}</td>
                  <td><strong>{i.recipientGroup}</strong></td>
                  <td>{BLOOD_COMPONENT_LABELS[i.unit.component]}</td>
                  <td>{i.crossMatchedBy ?? '—'}</td>
                  <td>{i.issuedBy ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function IssueForm({ onDone }: { onDone: () => Promise<void> }) {
  const [formErr, setFormErr] = useState<string | null>(null);
  const [patientQ, setPatientQ] = useState('');
  const [chosenPatient, setChosenPatient] = useState<Patient | null>(null);
  const debounced = useDebounced(patientQ, 300);
  const [form, setForm] = useState({
    patientId: '',
    recipientGroup: '' as BloodGroup | '',
    unitId: '',
    priceMajor: '',
    crossMatchedBy: '',
    note: '',
  });

  const patients = useQuery({
    queryKey: ['patients', 'lookup', debounced],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Patient>>('/patients', {
        params: { page: 1, pageSize: 20, ...(debounced ? { q: debounced } : {}) },
      });
      return data.data;
    },
  });

  const units = useQuery({
    queryKey: ['blood', 'units', 'available'],
    queryFn: async () => {
      const { data } = await api.get<BloodUnit[]>('/blood/units', {
        params: { status: 'available' },
      });
      return data;
    },
  });

  const issue = useMutation({
    mutationFn: async (payload: IssueBloodInput) => {
      const { data } = await api.post<BloodIssue>('/blood/issues', payload);
      return data;
    },
    onSuccess: onDone,
  });

  const chosenUnit = (units.data ?? []).find((u) => u.id === form.unitId) ?? null;

  // Derived during render. The list narrows to what is safe as soon as the
  // recipient's group is known — the server refuses the rest regardless.
  const safeUnits = form.recipientGroup
    ? (units.data ?? []).filter((u) =>
        compatibleDonorGroups(form.recipientGroup as BloodGroup, u.component).includes(
          u.bloodGroup,
        ),
      )
    : (units.data ?? []);

  const clash =
    chosenUnit && form.recipientGroup
      ? incompatibilityReason(
          chosenUnit.bloodGroup,
          form.recipientGroup as BloodGroup,
          chosenUnit.component,
        )
      : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    if (clash) {
      setFormErr(clash);
      return;
    }
    const parsed = issueBloodSchema.safeParse({
      unitId: form.unitId,
      patientId: form.patientId,
      recipientGroup: form.recipientGroup,
      priceMinor: form.priceMajor ? Math.max(0, toMinor(num(form.priceMajor))) : undefined,
      crossMatchedBy: blankToUndefined(form.crossMatchedBy),
      note: blankToUndefined(form.note),
    });
    if (!parsed.success) {
      setFormErr(zodMessage(parsed.error));
      return;
    }
    issue.mutate(parsed.data);
  };

  return (
    <form className="card" onSubmit={submit}>
      <h2>Issue a unit</h2>
      <p className="muted">
        Give the patient's group as your own cross-match established it, not as
        it appears on their file. An incompatible issue is refused, not warned
        about.
      </p>

      <div className="grid">
        <SearchSelect
          label="Patient"
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
            Issuing to <strong>{chosenPatient.firstName} {chosenPatient.lastName}</strong>{' '}
            ({chosenPatient.mrn}).
          </p>
        )}
        <label>
          Patient's group (cross-matched)
          <select
            value={form.recipientGroup}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                recipientGroup: e.target.value as BloodGroup,
                // A unit chosen for the old group may no longer be safe.
                unitId: '',
              }))
            }
            required
          >
            <option value="">Choose…</option>
            {BLOOD_GROUPS.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </label>
        <label>
          Unit
          <select
            value={form.unitId}
            onChange={(e) => setForm((f) => ({ ...f, unitId: e.target.value }))}
            required
          >
            <option value="">
              {form.recipientGroup ? 'Choose a compatible unit…' : 'Choose the group first…'}
            </option>
            {safeUnits.map((u) => (
              <option key={u.id} value={u.id}>
                {u.bagNo} — {u.bloodGroup} {BLOOD_COMPONENT_LABELS[u.component]} (expires{' '}
                {formatDate(u.expiresOn)})
              </option>
            ))}
          </select>
        </label>
        <label>
          Charge
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.priceMajor}
            onChange={(e) => setForm((f) => ({ ...f, priceMajor: e.target.value }))}
            placeholder="Leave blank for no charge"
          />
        </label>
        <label>
          Cross-matched by
          <input
            value={form.crossMatchedBy}
            onChange={(e) => setForm((f) => ({ ...f, crossMatchedBy: e.target.value }))}
          />
        </label>
      </div>

      {form.recipientGroup && (
        <p className="muted">
          A {form.recipientGroup} patient may receive red cells from{' '}
          <strong>
            {compatibleDonorGroups(form.recipientGroup as BloodGroup, 'packed_red_cells').join(', ')}
          </strong>
          , and plasma from{' '}
          <strong>
            {compatibleDonorGroups(form.recipientGroup as BloodGroup, 'plasma').join(', ')}
          </strong>
          . Plasma runs the opposite way to red cells.
        </p>
      )}

      {form.priceMajor && (
        <p className="muted">
          Charge: {formatMoney(Math.max(0, toMinor(num(form.priceMajor))))}
        </p>
      )}

      {clash && <div className="alert" role="alert">{clash}</div>}
      {formErr && <div className="alert" role="alert">{formErr}</div>}
      <ErrorNote error={issue.error} fallback="Could not issue this unit" />
      <div className="actions">
        <button type="submit" disabled={issue.isPending || !!clash}>
          {issue.isPending ? 'Issuing…' : 'Issue unit'}
        </button>
      </div>
    </form>
  );
}
