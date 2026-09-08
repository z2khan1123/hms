import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CALL_STAGE_LABELS,
  EMERGENCY_LEVEL_LABELS,
  VEHICLE_TYPE_LABELS,
  callStageSchema,
  cancelCallSchema,
  completeCallSchema,
  createCallSchema,
  createVehicleSchema,
  emergencyLevelSchema,
  formatMoney,
  suggestedCallCharge,
  toMinor,
  vehicleTypeSchema,
  type AmbulanceCall,
  type CallStage,
  type CreateCallInput,
  type CreateVehicleInput,
  type EmergencyLevel,
  type Paginated,
  type Patient,
  type Vehicle,
  type VehicleType,
} from '@hms/shared';
import { api } from '../lib/api';
import { useCan } from '../lib/permissions';
import { num } from '../lib/bill-line';
import { blankToUndefined, formatDateTime } from '../lib/format';
import { ErrorNote, Loading } from '../components/QueryFeedback';
import { SearchSelect } from '../components/SearchSelect';
import { StatusBadge } from '../components/StatusBadge';
import { Tabs, type TabDef } from '../components/Tabs';
import { useDebounced } from '../lib/useDebounced';

type TabValue = 'calls' | 'fleet' | 'response';

const TABS: readonly TabDef<TabValue>[] = [
  { value: 'calls', label: 'Calls' },
  { value: 'fleet', label: 'Fleet' },
  { value: 'response', label: 'Response times' },
];

const STAGES = callStageSchema.options;
const LEVELS = emergencyLevelSchema.options;
const VEHICLE_TYPES = vehicleTypeSchema.options;

function zodMessage(error: {
  issues: { message: string; path: (string | number)[] }[];
}): string {
  const first = error.issues[0];
  if (!first) return 'Check the values';
  return first.path.length ? `${first.path.join('.')}: ${first.message}` : first.message;
}

export function AmbulancePage() {
  const [tab, setTab] = useState<TabValue>('calls');

  return (
    <section>
      <h1>Ambulance</h1>
      <Tabs tabs={TABS} value={tab} onChange={setTab} ariaLabel="Ambulance sections" />
      {tab === 'calls' && <CallsTab />}
      {tab === 'fleet' && <FleetTab />}
      {tab === 'response' && <ResponseTab />}
    </section>
  );
}

// --- calls -----------------------------------------------------------------

function CallsTab() {
  const can = useCan();
  const queryClient = useQueryClient();
  const [stage, setStage] = useState<CallStage | ''>('');
  const [dispatching, setDispatching] = useState(false);
  const [closing, setClosing] = useState<AmbulanceCall | null>(null);

  const calls = useQuery({
    queryKey: ['ambulance', 'calls', stage],
    queryFn: async () => {
      const { data } = await api.get<AmbulanceCall[]>('/ambulance/calls', {
        params: stage ? { stage } : {},
      });
      return data;
    },
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['ambulance'] });
  };

  const arrive = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post<AmbulanceCall>(`/ambulance/calls/${id}/arrive`, {});
      return data;
    },
    onSuccess: invalidate,
  });

  const cancel = useMutation({
    mutationFn: async (input: { id: string; reason: string }) => {
      const body = cancelCallSchema.parse({ reason: input.reason });
      const { data } = await api.post<AmbulanceCall>(
        `/ambulance/calls/${input.id}/cancel`,
        body,
      );
      return data;
    },
    onSuccess: invalidate,
  });

  return (
    <div>
      <div className="toolbar">
        <select
          value={stage}
          onChange={(e) => setStage(e.target.value as CallStage | '')}
          aria-label="Stage"
        >
          <option value="">All calls</option>
          {STAGES.map((s) => (
            <option key={s} value={s}>{CALL_STAGE_LABELS[s]}</option>
          ))}
        </select>
        {can('call:dispatch') && (
          <button type="button" onClick={() => setDispatching((v) => !v)}>
            {dispatching ? 'Close' : 'Dispatch'}
          </button>
        )}
      </div>

      {dispatching && can('call:dispatch') && (
        <DispatchForm
          onDone={async () => {
            setDispatching(false);
            await invalidate();
          }}
        />
      )}

      {closing && (
        <CompleteForm
          call={closing}
          onDone={async () => {
            setClosing(null);
            await invalidate();
          }}
          onCancel={() => setClosing(null)}
        />
      )}

      <ErrorNote error={calls.error} fallback="Could not load the call log" />
      <ErrorNote error={arrive.error} fallback="Could not mark that arrival" />
      <ErrorNote error={cancel.error} fallback="Could not cancel that call" />
      {calls.isPending && <Loading label="Loading calls…" />}
      {calls.data?.length === 0 && <p className="muted">No calls match this filter.</p>}

      {!!calls.data?.length && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Call no.</th>
                <th>Vehicle</th>
                <th>Level</th>
                <th>For</th>
                <th>Pickup</th>
                <th>Dispatched</th>
                <th className="num">Response</th>
                <th>Stage</th>
                <th className="num">Charge</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {calls.data.map((c) => (
                <tr key={c.id}>
                  <td>{c.callNo}</td>
                  <td>{c.vehicle.registrationNo}</td>
                  <td>
                    <StatusBadge
                      status={c.emergencyLevel}
                      label={EMERGENCY_LEVEL_LABELS[c.emergencyLevel]}
                    />
                  </td>
                  <td>
                    {c.patient
                      ? `${c.patient.mrn} — ${c.patient.firstName} ${c.patient.lastName}`
                      : (c.callerName ?? '—')}
                  </td>
                  <td>{c.pickupAddress}</td>
                  <td>{formatDateTime(c.dispatchedAt)}</td>
                  <td className="num">
                    {c.responseMinutes === null ? '—' : `${c.responseMinutes} min`}
                  </td>
                  <td>
                    <StatusBadge status={c.stage} label={CALL_STAGE_LABELS[c.stage]} />
                  </td>
                  <td className="num">
                    {c.chargeMinor === null ? '—' : formatMoney(c.chargeMinor)}
                  </td>
                  <td>
                    {can('call:dispatch') && c.stage === 'dispatched' && (
                      <span className="actions">
                        <button
                          type="button"
                          disabled={arrive.isPending}
                          onClick={() => arrive.mutate(c.id)}
                        >
                          Arrived
                        </button>
                        <button
                          type="button"
                          disabled={cancel.isPending}
                          onClick={() => {
                            const reason = window.prompt('Why is this call being cancelled?');
                            if (reason?.trim()) {
                              cancel.mutate({ id: c.id, reason: reason.trim() });
                            }
                          }}
                        >
                          Cancel
                        </button>
                      </span>
                    )}
                    {can('call:dispatch') && c.stage === 'arrived' && (
                      <button type="button" onClick={() => setClosing(c)}>
                        Close call
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

function DispatchForm({ onDone }: { onDone: () => Promise<void> }) {
  const [formErr, setFormErr] = useState<string | null>(null);
  const [patientQ, setPatientQ] = useState('');
  const [chosenPatient, setChosenPatient] = useState<Patient | null>(null);
  const debounced = useDebounced(patientQ, 300);
  const [form, setForm] = useState({
    vehicleId: '',
    patientId: '',
    callerName: '',
    callerPhone: '',
    emergencyLevel: 'urgent' as EmergencyLevel,
    pickupAddress: '',
    dropAddress: '',
    note: '',
  });

  const vehicles = useQuery({
    queryKey: ['ambulance', 'vehicles', 'available'],
    queryFn: async () => {
      const { data } = await api.get<Vehicle[]>('/ambulance/vehicles', {
        params: { availableOnly: 'true' },
      });
      return data;
    },
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

  const dispatch = useMutation({
    mutationFn: async (payload: CreateCallInput) => {
      const { data } = await api.post<AmbulanceCall>('/ambulance/calls', payload);
      return data;
    },
    onSuccess: onDone,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    const parsed = createCallSchema.safeParse({
      vehicleId: form.vehicleId,
      patientId: blankToUndefined(form.patientId),
      callerName: blankToUndefined(form.callerName),
      callerPhone: blankToUndefined(form.callerPhone),
      emergencyLevel: form.emergencyLevel,
      pickupAddress: form.pickupAddress,
      dropAddress: blankToUndefined(form.dropAddress),
      note: blankToUndefined(form.note),
    });
    if (!parsed.success) {
      setFormErr(zodMessage(parsed.error));
      return;
    }
    if (!parsed.data.patientId && !parsed.data.callerName) {
      setFormErr('Give a caller name when the call is not for a registered patient');
      return;
    }
    dispatch.mutate(parsed.data);
  };

  return (
    <form className="card" onSubmit={submit}>
      <h2>Dispatch</h2>
      <p className="muted">
        A patient record is not required — most callers are not registered here
        yet. A name and a phone number are enough to send a vehicle.
      </p>

      <div className="grid">
        <label>
          Vehicle
          <select
            value={form.vehicleId}
            onChange={(e) => setForm((f) => ({ ...f, vehicleId: e.target.value }))}
            required
          >
            <option value="">Choose…</option>
            {(vehicles.data ?? []).map((v) => (
              <option key={v.id} value={v.id}>
                {v.registrationNo} — {VEHICLE_TYPE_LABELS[v.type]}
                {v.driverName ? ` (${v.driverName})` : ''}
              </option>
            ))}
          </select>
        </label>
        <label>
          Emergency level
          <select
            value={form.emergencyLevel}
            onChange={(e) =>
              setForm((f) => ({ ...f, emergencyLevel: e.target.value as EmergencyLevel }))
            }
          >
            {LEVELS.map((l) => (
              <option key={l} value={l}>{EMERGENCY_LEVEL_LABELS[l]}</option>
            ))}
          </select>
        </label>
        <label>
          Caller name
          <input
            value={form.callerName}
            onChange={(e) => setForm((f) => ({ ...f, callerName: e.target.value }))}
          />
        </label>
        <label>
          Caller phone
          <input
            value={form.callerPhone}
            onChange={(e) => setForm((f) => ({ ...f, callerPhone: e.target.value }))}
          />
        </label>
      </div>

      {vehicles.data?.length === 0 && (
        <div className="alert" role="alert">
          Every vehicle is already out on a call.
        </div>
      )}

      <SearchSelect
        label="Registered patient (optional)"
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
          Linked to <strong>{chosenPatient.firstName} {chosenPatient.lastName}</strong>{' '}
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

      <label>
        Pickup address
        <input
          value={form.pickupAddress}
          onChange={(e) => setForm((f) => ({ ...f, pickupAddress: e.target.value }))}
          required
        />
      </label>
      <label>
        Drop address
        <input
          value={form.dropAddress}
          onChange={(e) => setForm((f) => ({ ...f, dropAddress: e.target.value }))}
        />
      </label>

      {formErr && <div className="alert" role="alert">{formErr}</div>}
      <ErrorNote error={dispatch.error} fallback="Could not dispatch this vehicle" />
      <div className="actions">
        <button type="submit" disabled={dispatch.isPending}>
          {dispatch.isPending ? 'Dispatching…' : 'Dispatch'}
        </button>
      </div>
    </form>
  );
}

function CompleteForm({
  call,
  onDone,
  onCancel,
}: {
  call: AmbulanceCall;
  onDone: () => Promise<void>;
  onCancel: () => void;
}) {
  const [formErr, setFormErr] = useState<string | null>(null);
  const [distanceKm, setDistanceKm] = useState('');
  const [chargeMajor, setChargeMajor] = useState('');
  const [note, setNote] = useState('');

  // Derived during render, so the suggestion follows the distance as it is
  // typed. It only ever pre-fills — what is billed is what the operator sets.
  const suggested = suggestedCallCharge({
    baseChargeMinor: call.vehicle.baseChargeMinor,
    perKmChargeMinor: call.vehicle.perKmChargeMinor,
    distanceKm: distanceKm ? num(distanceKm) : 0,
  });

  const complete = useMutation({
    mutationFn: async () => {
      const body = completeCallSchema.parse({
        distanceKm: distanceKm ? num(distanceKm) : undefined,
        chargeMinor: chargeMajor
          ? Math.max(0, toMinor(num(chargeMajor)))
          : undefined,
        note: blankToUndefined(note),
      });
      const { data } = await api.post<AmbulanceCall>(
        `/ambulance/calls/${call.id}/complete`,
        body,
      );
      return data;
    },
    onSuccess: onDone,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    if (chargeMajor && !call.patient) {
      setFormErr(
        'A charge needs a patient. Close this call without a charge, or link a patient first.',
      );
      return;
    }
    complete.mutate();
  };

  return (
    <form className="card" onSubmit={submit}>
      <h2>Close call {call.callNo}</h2>
      <p className="muted">
        {call.patient
          ? `For ${call.patient.firstName} ${call.patient.lastName} (${call.patient.mrn}).`
          : 'No patient is linked, so this call can be logged but not billed.'}
      </p>

      <div className="grid">
        <label>
          Distance (km)
          <input
            type="number"
            min="0"
            step="0.1"
            value={distanceKm}
            onChange={(e) => setDistanceKm(e.target.value)}
          />
        </label>
        <label>
          Charge
          <input
            type="number"
            min="0"
            step="0.01"
            value={chargeMajor}
            onChange={(e) => setChargeMajor(e.target.value)}
            placeholder="Leave blank for no charge"
            disabled={!call.patient}
          />
        </label>
      </div>

      {suggested > 0 && call.patient && (
        <p className="muted">
          Suggested from this vehicle's rates: {formatMoney(suggested)}{' '}
          <button
            type="button"
            onClick={() => setChargeMajor(String(suggested / 100))}
          >
            Use it
          </button>
        </p>
      )}

      <label>
        Note
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
      </label>

      {formErr && <div className="alert" role="alert">{formErr}</div>}
      <ErrorNote error={complete.error} fallback="Could not close this call" />
      <div className="actions">
        <button type="submit" disabled={complete.isPending}>
          {complete.isPending ? 'Closing…' : 'Close call'}
        </button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}

// --- fleet -----------------------------------------------------------------

function FleetTab() {
  const can = useCan();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);

  const vehicles = useQuery({
    queryKey: ['ambulance', 'vehicles', 'list'],
    queryFn: async () => {
      const { data } = await api.get<Vehicle[]>('/ambulance/vehicles', {
        params: { includeInactive: 'true' },
      });
      return data;
    },
  });

  return (
    <div>
      {can('vehicle:manage') && (
        <div className="toolbar">
          <button type="button" onClick={() => setAdding((v) => !v)}>
            {adding ? 'Close' : 'Add vehicle'}
          </button>
        </div>
      )}

      {adding && can('vehicle:manage') && (
        <VehicleForm
          onDone={async () => {
            setAdding(false);
            await queryClient.invalidateQueries({ queryKey: ['ambulance', 'vehicles'] });
          }}
        />
      )}

      <ErrorNote error={vehicles.error} fallback="Could not load the fleet" />
      {vehicles.isPending && <Loading label="Loading fleet…" />}
      {vehicles.data?.length === 0 && (
        <p className="muted">
          No vehicles yet.{can('vehicle:manage') && ' Use “Add vehicle” to register one.'}
        </p>
      )}

      {!!vehicles.data?.length && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Registration</th>
                <th>Type</th>
                <th>Model</th>
                <th>Driver</th>
                <th className="num">Base</th>
                <th className="num">Per km</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.data.map((v) => (
                <tr key={v.id}>
                  <td>{v.registrationNo}</td>
                  <td>{VEHICLE_TYPE_LABELS[v.type]}</td>
                  <td>{v.model ?? '—'}</td>
                  <td>
                    {v.driverName ?? '—'}
                    {v.driverPhone ? ` · ${v.driverPhone}` : ''}
                  </td>
                  <td className="num">
                    {v.baseChargeMinor === null ? '—' : formatMoney(v.baseChargeMinor)}
                  </td>
                  <td className="num">
                    {v.perKmChargeMinor === null ? '—' : formatMoney(v.perKmChargeMinor)}
                  </td>
                  <td>
                    {!v.isActive ? (
                      <StatusBadge status="inactive" label="Out of service" />
                    ) : v.isOnCall ? (
                      <StatusBadge status="occupied" label="On a call" />
                    ) : (
                      <StatusBadge status="available" label="Available" />
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

function VehicleForm({ onDone }: { onDone: () => Promise<void> }) {
  const [formErr, setFormErr] = useState<string | null>(null);
  const [form, setForm] = useState({
    registrationNo: '',
    model: '',
    type: 'basic' as VehicleType,
    driverName: '',
    driverPhone: '',
    baseMajor: '',
    perKmMajor: '',
  });

  const create = useMutation({
    mutationFn: async (payload: CreateVehicleInput) => {
      const { data } = await api.post<Vehicle>('/ambulance/vehicles', payload);
      return data;
    },
    onSuccess: onDone,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    const parsed = createVehicleSchema.safeParse({
      registrationNo: form.registrationNo,
      model: blankToUndefined(form.model),
      type: form.type,
      driverName: blankToUndefined(form.driverName),
      driverPhone: blankToUndefined(form.driverPhone),
      baseChargeMinor: form.baseMajor
        ? Math.max(0, toMinor(num(form.baseMajor)))
        : undefined,
      perKmChargeMinor: form.perKmMajor
        ? Math.max(0, toMinor(num(form.perKmMajor)))
        : undefined,
    });
    if (!parsed.success) {
      setFormErr(zodMessage(parsed.error));
      return;
    }
    create.mutate(parsed.data);
  };

  return (
    <form className="card" onSubmit={submit}>
      <h2>Add vehicle</h2>
      <div className="grid">
        <label>
          Registration number
          <input
            value={form.registrationNo}
            onChange={(e) => setForm((f) => ({ ...f, registrationNo: e.target.value }))}
            required
          />
        </label>
        <label>
          Type
          <select
            value={form.type}
            onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as VehicleType }))}
          >
            {VEHICLE_TYPES.map((t) => (
              <option key={t} value={t}>{VEHICLE_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </label>
        <label>
          Model
          <input
            value={form.model}
            onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
          />
        </label>
        <label>
          Driver
          <input
            value={form.driverName}
            onChange={(e) => setForm((f) => ({ ...f, driverName: e.target.value }))}
          />
        </label>
        <label>
          Driver phone
          <input
            value={form.driverPhone}
            onChange={(e) => setForm((f) => ({ ...f, driverPhone: e.target.value }))}
          />
        </label>
        <label>
          Base charge
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.baseMajor}
            onChange={(e) => setForm((f) => ({ ...f, baseMajor: e.target.value }))}
          />
        </label>
        <label>
          Charge per km
          <input
            type="number"
            min="0"
            step="0.01"
            value={form.perKmMajor}
            onChange={(e) => setForm((f) => ({ ...f, perKmMajor: e.target.value }))}
          />
        </label>
      </div>
      <p className="muted">
        These rates only pre-fill the charge when a call is closed. What is billed
        is always what the operator confirms.
      </p>

      {formErr && <div className="alert" role="alert">{formErr}</div>}
      <ErrorNote error={create.error} fallback="Could not add this vehicle" />
      <div className="actions">
        <button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Saving…' : 'Add vehicle'}
        </button>
      </div>
    </form>
  );
}

// --- response times --------------------------------------------------------

interface ResponseStats {
  calls: number;
  arrived: number;
  averageResponseMinutes: number | null;
  byLevel: {
    emergencyLevel: EmergencyLevel;
    calls: number;
    averageResponseMinutes: number | null;
  }[];
}

function ResponseTab() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const stats = useQuery({
    queryKey: ['ambulance', 'stats', from, to],
    queryFn: async () => {
      const { data } = await api.get<ResponseStats>('/ambulance/calls/stats', {
        params: { ...(from ? { from } : {}), ...(to ? { to } : {}) },
      });
      return data;
    },
  });

  return (
    <div>
      <div className="toolbar">
        <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          From
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          To
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      <ErrorNote error={stats.error} fallback="Could not load response times" />
      {stats.isPending && <Loading label="Loading response times…" />}

      {stats.data && (
        <div className="card">
          <p>
            <strong>{stats.data.calls}</strong> calls, {stats.data.arrived} reached the
            scene
            {stats.data.averageResponseMinutes !== null && (
              <>
                {' '}
                — average response{' '}
                <strong>{stats.data.averageResponseMinutes} minutes</strong>
              </>
            )}
          </p>
          <p className="muted">
            Cancelled calls are excluded. Response is dispatch to arrival, which is
            the figure a service is actually judged on.
          </p>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Level</th>
                  <th className="num">Calls</th>
                  <th className="num">Average response</th>
                </tr>
              </thead>
              <tbody>
                {stats.data.byLevel.map((l) => (
                  <tr key={l.emergencyLevel}>
                    <td>{EMERGENCY_LEVEL_LABELS[l.emergencyLevel]}</td>
                    <td className="num">{l.calls}</td>
                    <td className="num">
                      {l.averageResponseMinutes === null
                        ? '—'
                        : `${l.averageResponseMinutes} min`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
