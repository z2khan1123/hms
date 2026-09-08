import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DELIVERY_TYPE_LABELS,
  createBirthRecordSchema,
  createDeathRecordSchema,
  deliveryTypeSchema,
  genderSchema,
  motherLabel,
  recordRegistrationSchema,
  type BirthRecord,
  type CreateBirthRecordInput,
  type CreateDeathRecordInput,
  type DeathRecord,
  type DeliveryType,
  type Gender,
  type Paginated,
  type Patient,
  type Practitioner,
} from '@hms/shared';
import { api } from '../lib/api';
import { useCan } from '../lib/permissions';
import { blankToUndefined, formatDate, formatDateTime, toLocalInput, localInputToIso } from '../lib/format';
import { ErrorNote, Loading } from '../components/QueryFeedback';
import { SearchSelect } from '../components/SearchSelect';
import { StatusBadge } from '../components/StatusBadge';
import { Tabs, type TabDef } from '../components/Tabs';
import { useDebounced } from '../lib/useDebounced';

type TabValue = 'births' | 'deaths';

const TABS: readonly TabDef<TabValue>[] = [
  { value: 'births', label: 'Births' },
  { value: 'deaths', label: 'Deaths' },
];

const DELIVERY_TYPES = deliveryTypeSchema.options;
const GENDERS = genderSchema.options;

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

export function RegistersPage() {
  const [tab, setTab] = useState<TabValue>('births');
  const can = useCan();

  return (
    <section>
      <h1>Registers</h1>
      <p className="muted">
        The hospital issues the source document. The family registers it at the
        Union Council, and that number is recorded here when it comes back.
      </p>
      <Tabs tabs={TABS} value={tab} onChange={setTab} ariaLabel="Register sections" />
      {tab === 'births' && can('birth:read') && <BirthsTab />}
      {tab === 'births' && !can('birth:read') && (
        <p className="muted">You do not have access to the birth register.</p>
      )}
      {tab === 'deaths' && can('death:read') && <DeathsTab />}
      {tab === 'deaths' && !can('death:read') && (
        <p className="muted">You do not have access to the death register.</p>
      )}
    </section>
  );
}

// --- shared ----------------------------------------------------------------

function usePractitioners() {
  return useQuery({
    queryKey: ['practitioners', 'lookup'],
    queryFn: async () => {
      const { data } = await api.get<Practitioner[]>('/practitioners');
      return data;
    },
  });
}

function RegistrationForm({
  kind,
  id,
  onDone,
}: {
  kind: 'births' | 'deaths';
  id: string;
  onDone: () => Promise<void>;
}) {
  const [registrationNo, setRegistrationNo] = useState('');
  const [registeredOn, setRegisteredOn] = useState(new Date().toISOString().slice(0, 10));
  const [formErr, setFormErr] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const body = recordRegistrationSchema.parse({ registrationNo, registeredOn });
      const { data } = await api.post(`/registers/${kind}/${id}/registration`, body);
      return data;
    },
    onSuccess: onDone,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    const parsed = recordRegistrationSchema.safeParse({ registrationNo, registeredOn });
    if (!parsed.success) {
      setFormErr(zodMessage(parsed.error));
      return;
    }
    save.mutate();
  };

  return (
    <form className="card" onSubmit={submit}>
      <h3>Record the Union Council registration</h3>
      <div className="toolbar">
        <label style={inlineLabel}>
          Registration number
          <input
            value={registrationNo}
            onChange={(e) => setRegistrationNo(e.target.value)}
            required
          />
        </label>
        <label style={inlineLabel}>
          Registered on
          <input
            type="date"
            value={registeredOn}
            onChange={(e) => setRegisteredOn(e.target.value)}
            required
          />
        </label>
        <button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving…' : 'Save'}
        </button>
      </div>
      {formErr && <div className="alert" role="alert">{formErr}</div>}
      <ErrorNote error={save.error} fallback="Could not record that registration" />
    </form>
  );
}

// --- births ----------------------------------------------------------------

function BirthsTab() {
  const can = useCan();
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [unregisteredOnly, setUnregisteredOnly] = useState(false);
  const [adding, setAdding] = useState(false);
  const [registering, setRegistering] = useState<string | null>(null);
  const debounced = useDebounced(q, 300);

  const births = useQuery({
    queryKey: ['registers', 'births', debounced, unregisteredOnly],
    queryFn: async () => {
      const { data } = await api.get<BirthRecord[]>('/registers/births', {
        params: {
          ...(debounced ? { q: debounced } : {}),
          ...(unregisteredOnly ? { unregisteredOnly: 'true' } : {}),
        },
      });
      return data;
    },
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['registers', 'births'] });
  };

  return (
    <div>
      <div className="toolbar">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search certificate, child, mother or father"
          aria-label="Search births"
        />
        <label style={inlineLabel}>
          <input
            type="checkbox"
            checked={unregisteredOnly}
            onChange={(e) => setUnregisteredOnly(e.target.checked)}
          />
          Not yet registered with the Union Council
        </label>
        {can('birth:manage') && (
          <button type="button" onClick={() => setAdding((v) => !v)}>
            {adding ? 'Close' : 'Record a birth'}
          </button>
        )}
      </div>

      {adding && can('birth:manage') && (
        <BirthForm
          onDone={async () => {
            setAdding(false);
            await invalidate();
          }}
        />
      )}

      {registering && can('birth:manage') && (
        <RegistrationForm
          kind="births"
          id={registering}
          onDone={async () => {
            setRegistering(null);
            await invalidate();
          }}
        />
      )}

      <ErrorNote error={births.error} fallback="Could not load the birth register" />
      {births.isPending && <Loading label="Loading births…" />}
      {births.data?.length === 0 && (
        <p className="muted">No births match this filter.</p>
      )}

      {!!births.data?.length && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Certificate</th>
                <th>Child</th>
                <th>Sex</th>
                <th>Born</th>
                <th className="num">Weight</th>
                <th>Delivery</th>
                <th>Mother</th>
                <th>Attended by</th>
                <th>Registration</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {births.data.map((b) => (
                <tr key={b.id}>
                  <td>{b.certificateNo}</td>
                  <td>{b.childName ?? <span className="muted">Not yet named</span>}</td>
                  <td>{b.gender}</td>
                  <td>{formatDateTime(b.bornAt)}</td>
                  <td className="num">
                    {b.birthWeightGrams === null ? '—' : `${b.birthWeightGrams} g`}
                  </td>
                  <td>{DELIVERY_TYPE_LABELS[b.deliveryType]}</td>
                  <td>{motherLabel(b)}</td>
                  <td>{b.attendedBy ?? '—'}</td>
                  <td>
                    {b.isRegistered ? (
                      <>
                        {b.registrationNo}
                        {b.registeredOn && ` · ${formatDate(b.registeredOn)}`}
                      </>
                    ) : (
                      <StatusBadge status="pending" label="Not registered" />
                    )}
                  </td>
                  <td>
                    {can('birth:manage') && !b.isRegistered && (
                      <button type="button" onClick={() => setRegistering(b.id)}>
                        Record registration
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

function BirthForm({ onDone }: { onDone: () => Promise<void> }) {
  const [formErr, setFormErr] = useState<string | null>(null);
  const [motherQ, setMotherQ] = useState('');
  const [chosenMother, setChosenMother] = useState<Patient | null>(null);
  const debounced = useDebounced(motherQ, 300);
  const practitioners = usePractitioners();

  const [form, setForm] = useState({
    childName: '',
    gender: 'unknown' as Gender,
    bornAt: toLocalInput(new Date()),
    birthWeightGrams: '',
    deliveryType: 'normal' as DeliveryType,
    motherPatientId: '',
    motherName: '',
    motherCnic: '',
    fatherName: '',
    fatherCnic: '',
    contactPhone: '',
    address: '',
    attendedById: '',
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

  const create = useMutation({
    mutationFn: async (payload: CreateBirthRecordInput) => {
      const { data } = await api.post<BirthRecord>('/registers/births', payload);
      return data;
    },
    onSuccess: onDone,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    const parsed = createBirthRecordSchema.safeParse({
      childName: blankToUndefined(form.childName),
      gender: form.gender,
      bornAt: localInputToIso(form.bornAt),
      birthWeightGrams: form.birthWeightGrams
        ? Number(form.birthWeightGrams)
        : undefined,
      deliveryType: form.deliveryType,
      motherPatientId: blankToUndefined(form.motherPatientId),
      motherName: blankToUndefined(form.motherName),
      motherCnic: blankToUndefined(form.motherCnic),
      fatherName: blankToUndefined(form.fatherName),
      fatherCnic: blankToUndefined(form.fatherCnic),
      contactPhone: blankToUndefined(form.contactPhone),
      address: blankToUndefined(form.address),
      attendedById: blankToUndefined(form.attendedById),
      note: blankToUndefined(form.note),
    });
    if (!parsed.success) {
      setFormErr(zodMessage(parsed.error));
      return;
    }
    if (!parsed.data.motherPatientId && !parsed.data.motherName) {
      setFormErr("Give the mother's name when she is not registered here");
      return;
    }
    create.mutate(parsed.data);
  };

  return (
    <form className="card" onSubmit={submit}>
      <h2>Record a birth</h2>
      <p className="muted">
        The child's name may be left blank — families often do not name a child
        for days, and a legal document should not carry an invented one.
      </p>

      <div className="grid">
        <label>
          Child's name
          <input
            value={form.childName}
            onChange={(e) => setForm((f) => ({ ...f, childName: e.target.value }))}
            placeholder="Leave blank if not yet named"
          />
        </label>
        <label>
          Sex
          <select
            value={form.gender}
            onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value as Gender }))}
          >
            {GENDERS.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </label>
        <label>
          Born at
          <input
            type="datetime-local"
            value={form.bornAt}
            onChange={(e) => setForm((f) => ({ ...f, bornAt: e.target.value }))}
            required
          />
        </label>
        <label>
          Weight (grams)
          <input
            type="number"
            min="200"
            max="10000"
            value={form.birthWeightGrams}
            onChange={(e) => setForm((f) => ({ ...f, birthWeightGrams: e.target.value }))}
          />
        </label>
        <label>
          Delivery
          <select
            value={form.deliveryType}
            onChange={(e) =>
              setForm((f) => ({ ...f, deliveryType: e.target.value as DeliveryType }))
            }
          >
            {DELIVERY_TYPES.map((d) => (
              <option key={d} value={d}>{DELIVERY_TYPE_LABELS[d]}</option>
            ))}
          </select>
        </label>
        <label>
          Attended by
          <select
            value={form.attendedById}
            onChange={(e) => setForm((f) => ({ ...f, attendedById: e.target.value }))}
          >
            <option value="">—</option>
            {(practitioners.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.firstName} {p.lastName}
              </option>
            ))}
          </select>
        </label>
      </div>

      <SearchSelect
        label="Mother (if registered here)"
        placeholder="Search patients"
        query={motherQ}
        onQueryChange={setMotherQ}
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
          setForm((f) => ({ ...f, motherPatientId: p.id }));
          setChosenMother(p);
        }}
      />
      {chosenMother && (
        <p className="muted">
          Mother: <strong>{chosenMother.firstName} {chosenMother.lastName}</strong>{' '}
          ({chosenMother.mrn}).{' '}
          <button
            type="button"
            onClick={() => {
              setForm((f) => ({ ...f, motherPatientId: '' }));
              setChosenMother(null);
            }}
          >
            Clear
          </button>
        </p>
      )}

      <div className="grid">
        <label>
          Mother's name (if not registered)
          <input
            value={form.motherName}
            onChange={(e) => setForm((f) => ({ ...f, motherName: e.target.value }))}
          />
        </label>
        <label>
          Mother's CNIC
          <input
            value={form.motherCnic}
            onChange={(e) => setForm((f) => ({ ...f, motherCnic: e.target.value }))}
            placeholder="35202-1234567-1"
          />
        </label>
        <label>
          Father's name
          <input
            value={form.fatherName}
            onChange={(e) => setForm((f) => ({ ...f, fatherName: e.target.value }))}
          />
        </label>
        <label>
          Father's CNIC
          <input
            value={form.fatherCnic}
            onChange={(e) => setForm((f) => ({ ...f, fatherCnic: e.target.value }))}
            placeholder="35202-1234567-1"
          />
        </label>
        <label>
          Contact phone
          <input
            value={form.contactPhone}
            onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))}
            placeholder="+923001234567"
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
      <p className="muted">
        CNICs are stored as a salted hash plus the last four digits, exactly as a
        patient's is — never in plain text.
      </p>

      {formErr && <div className="alert" role="alert">{formErr}</div>}
      <ErrorNote error={create.error} fallback="Could not record this birth" />
      <div className="actions">
        <button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Saving…' : 'Record birth'}
        </button>
      </div>
    </form>
  );
}

// --- deaths ----------------------------------------------------------------

function DeathsTab() {
  const can = useCan();
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [unregisteredOnly, setUnregisteredOnly] = useState(false);
  const [adding, setAdding] = useState(false);
  const [registering, setRegistering] = useState<string | null>(null);
  const debounced = useDebounced(q, 300);

  const deaths = useQuery({
    queryKey: ['registers', 'deaths', debounced, unregisteredOnly],
    queryFn: async () => {
      const { data } = await api.get<DeathRecord[]>('/registers/deaths', {
        params: {
          ...(debounced ? { q: debounced } : {}),
          ...(unregisteredOnly ? { unregisteredOnly: 'true' } : {}),
        },
      });
      return data;
    },
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['registers', 'deaths'] });
    // A death marks the patient deceased, so any patient list is now stale.
    await queryClient.invalidateQueries({ queryKey: ['patients'] });
  };

  return (
    <div>
      <div className="toolbar">
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search certificate, patient or cause"
          aria-label="Search deaths"
        />
        <label style={inlineLabel}>
          <input
            type="checkbox"
            checked={unregisteredOnly}
            onChange={(e) => setUnregisteredOnly(e.target.checked)}
          />
          Not yet registered with the Union Council
        </label>
        {can('death:manage') && (
          <button type="button" onClick={() => setAdding((v) => !v)}>
            {adding ? 'Close' : 'Record a death'}
          </button>
        )}
      </div>

      {adding && can('death:manage') && (
        <DeathForm
          onDone={async () => {
            setAdding(false);
            await invalidate();
          }}
        />
      )}

      {registering && can('death:manage') && (
        <RegistrationForm
          kind="deaths"
          id={registering}
          onDone={async () => {
            setRegistering(null);
            await invalidate();
          }}
        />
      )}

      <ErrorNote error={deaths.error} fallback="Could not load the death register" />
      {deaths.isPending && <Loading label="Loading deaths…" />}
      {deaths.data?.length === 0 && <p className="muted">No deaths match this filter.</p>}

      {!!deaths.data?.length && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Certificate</th>
                <th>Patient</th>
                <th>Died</th>
                <th>Cause</th>
                <th>Place</th>
                <th>Certified by</th>
                <th>Informant</th>
                <th>Registration</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {deaths.data.map((d) => (
                <tr key={d.id}>
                  <td>{d.certificateNo}</td>
                  <td>
                    {d.patient.mrn} — {d.patient.firstName} {d.patient.lastName}
                  </td>
                  <td>{formatDateTime(d.diedAt)}</td>
                  <td>{d.causeOfDeath}</td>
                  <td>{d.placeOfDeath ?? '—'}</td>
                  <td>{d.certifiedBy ?? '—'}</td>
                  <td>
                    {d.informantName ?? '—'}
                    {d.informantRelation ? ` (${d.informantRelation})` : ''}
                  </td>
                  <td>
                    {d.isRegistered ? (
                      <>
                        {d.registrationNo}
                        {d.registeredOn && ` · ${formatDate(d.registeredOn)}`}
                      </>
                    ) : (
                      <StatusBadge status="pending" label="Not registered" />
                    )}
                  </td>
                  <td>
                    {can('death:manage') && !d.isRegistered && (
                      <button type="button" onClick={() => setRegistering(d.id)}>
                        Record registration
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

function DeathForm({ onDone }: { onDone: () => Promise<void> }) {
  const [formErr, setFormErr] = useState<string | null>(null);
  const [patientQ, setPatientQ] = useState('');
  const [chosenPatient, setChosenPatient] = useState<Patient | null>(null);
  const debounced = useDebounced(patientQ, 300);
  const practitioners = usePractitioners();

  const [form, setForm] = useState({
    patientId: '',
    diedAt: toLocalInput(new Date()),
    causeOfDeath: '',
    placeOfDeath: '',
    certifiedById: '',
    informantName: '',
    informantPhone: '',
    informantRelation: '',
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

  const create = useMutation({
    mutationFn: async (payload: CreateDeathRecordInput) => {
      const { data } = await api.post<DeathRecord>('/registers/deaths', payload);
      return data;
    },
    onSuccess: onDone,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    const parsed = createDeathRecordSchema.safeParse({
      patientId: form.patientId,
      diedAt: localInputToIso(form.diedAt),
      causeOfDeath: form.causeOfDeath,
      placeOfDeath: blankToUndefined(form.placeOfDeath),
      certifiedById: blankToUndefined(form.certifiedById),
      informantName: blankToUndefined(form.informantName),
      informantPhone: blankToUndefined(form.informantPhone),
      informantRelation: blankToUndefined(form.informantRelation),
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
      <h2>Record a death</h2>
      <p className="muted">
        This also marks the patient deceased. The two facts are written together
        so nothing else in the system can go on treating them as bookable.
      </p>

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
          Recording the death of{' '}
          <strong>{chosenPatient.firstName} {chosenPatient.lastName}</strong>{' '}
          ({chosenPatient.mrn}).
        </p>
      )}

      <div className="grid">
        <label>
          Died at
          <input
            type="datetime-local"
            value={form.diedAt}
            onChange={(e) => setForm((f) => ({ ...f, diedAt: e.target.value }))}
            required
          />
        </label>
        <label>
          Place of death
          <input
            value={form.placeOfDeath}
            onChange={(e) => setForm((f) => ({ ...f, placeOfDeath: e.target.value }))}
            placeholder="Ward, emergency room, brought in dead"
          />
        </label>
        <label>
          Certified by
          <select
            value={form.certifiedById}
            onChange={(e) => setForm((f) => ({ ...f, certifiedById: e.target.value }))}
          >
            <option value="">—</option>
            {(practitioners.data ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.firstName} {p.lastName}
              </option>
            ))}
          </select>
        </label>
        <label>
          Informant
          <input
            value={form.informantName}
            onChange={(e) => setForm((f) => ({ ...f, informantName: e.target.value }))}
          />
        </label>
        <label>
          Informant's relation
          <input
            value={form.informantRelation}
            onChange={(e) =>
              setForm((f) => ({ ...f, informantRelation: e.target.value }))
            }
            placeholder="Son, wife, brother"
          />
        </label>
        <label>
          Informant's phone
          <input
            value={form.informantPhone}
            onChange={(e) => setForm((f) => ({ ...f, informantPhone: e.target.value }))}
            placeholder="+923001234567"
          />
        </label>
      </div>

      <label>
        Cause of death
        <textarea
          value={form.causeOfDeath}
          onChange={(e) => setForm((f) => ({ ...f, causeOfDeath: e.target.value }))}
          rows={2}
          required
        />
      </label>

      {formErr && <div className="alert" role="alert">{formErr}</div>}
      <ErrorNote error={create.error} fallback="Could not record this death" />
      <div className="actions">
        <button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Saving…' : 'Record death'}
        </button>
      </div>
    </form>
  );
}
