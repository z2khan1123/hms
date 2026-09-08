import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  invitePortalAccountSchema,
  type InvitePortalAccountInput,
  type Paginated,
  type Patient,
  type PortalAccount,
  type PortalInvite,
} from '@hms/shared';
import { api } from '../lib/api';
import { useCan } from '../lib/permissions';
import { blankToUndefined, formatDate, formatDateTime } from '../lib/format';
import { ErrorNote, Loading } from '../components/QueryFeedback';
import { SearchSelect } from '../components/SearchSelect';
import { StatusBadge } from '../components/StatusBadge';
import { Tabs, type TabDef } from '../components/Tabs';
import { useDebounced } from '../lib/useDebounced';

type TabValue = 'accounts' | 'requests';

const TABS: readonly TabDef<TabValue>[] = [
  { value: 'accounts', label: 'Portal accounts' },
  { value: 'requests', label: 'Appointment requests' },
];

function zodMessage(error: {
  issues: { message: string; path: (string | number)[] }[];
}): string {
  return error.issues[0]?.message ?? 'Check the values';
}

export function PortalAdminPage() {
  const can = useCan();
  const [tab, setTab] = useState<TabValue>('accounts');

  if (!can('portal:manage') && !can('appointment:read')) {
    return (
      <section>
        <h1>Patient portal</h1>
        <p className="muted">You do not have access to the patient portal.</p>
      </section>
    );
  }

  return (
    <section>
      <h1>Patient portal</h1>
      <p className="muted">
        Patients are invited from here — they cannot sign themselves up, because
        anyone can read an MRN off a slip. Inviting is the check that the person
        in front of you is the person on the record.
      </p>
      <Tabs tabs={TABS} value={tab} onChange={setTab} ariaLabel="Portal sections" />
      {tab === 'accounts' && can('portal:manage') && <AccountsTab />}
      {tab === 'accounts' && !can('portal:manage') && (
        <p className="muted">You cannot manage portal accounts.</p>
      )}
      {tab === 'requests' && <RequestsTab />}
    </section>
  );
}

// --- accounts ----------------------------------------------------------------

function AccountsTab() {
  const queryClient = useQueryClient();
  const [inviting, setInviting] = useState(false);
  const [issued, setIssued] = useState<PortalInvite | null>(null);

  const accounts = useQuery({
    queryKey: ['portal-admin', 'accounts'],
    queryFn: async () => {
      const { data } = await api.get<PortalAccount[]>('/portal-admin/accounts');
      return data;
    },
  });

  const setActive = useMutation({
    mutationFn: async (input: { patientId: string; isActive: boolean }) => {
      const { data } = await api.post<PortalAccount>(
        `/portal-admin/accounts/${input.patientId}/active`,
        { isActive: input.isActive },
      );
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['portal-admin', 'accounts'] });
    },
  });

  return (
    <div>
      <div className="toolbar">
        <button
          type="button"
          onClick={() => {
            setInviting((v) => !v);
            setIssued(null);
          }}
        >
          {inviting ? 'Close' : 'Invite a patient'}
        </button>
      </div>

      {issued && (
        <div className="card">
          <h3>Invitation for {issued.patientName}</h3>
          <p className="alert" role="alert">
            Give this code to the patient now. It is stored only as a hash, so it
            cannot be shown again — if it is lost, invite them again.
          </p>
          <pre style={{ overflowX: 'auto', userSelect: 'all' }}>{issued.inviteToken}</pre>
          <p className="muted">
            Valid until {formatDateTime(issued.inviteExpiresAt)}. They set a
            password with it at <code>/portal</code>, and it works once.
          </p>
        </div>
      )}

      {inviting && (
        <InviteForm
          onDone={async (invite) => {
            setInviting(false);
            setIssued(invite);
            await queryClient.invalidateQueries({ queryKey: ['portal-admin', 'accounts'] });
          }}
        />
      )}

      <ErrorNote error={accounts.error} fallback="Could not load portal accounts" />
      <ErrorNote error={setActive.error} fallback="Could not change that account" />
      {accounts.isPending && <Loading label="Loading accounts…" />}
      {accounts.data?.length === 0 && (
        <p className="muted">No patients have been invited yet.</p>
      )}

      {!!accounts.data?.length && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>MRN</th>
                <th>Patient</th>
                <th>Contact</th>
                <th>Invited</th>
                <th>Last signed in</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {accounts.data.map((a) => (
                <tr key={a.id}>
                  <td>{a.mrn}</td>
                  <td>{a.patientName}</td>
                  <td>{a.email ?? a.phone ?? '—'}</td>
                  <td>{formatDate(a.invitedAt)}</td>
                  <td>{a.lastLoginAt ? formatDateTime(a.lastLoginAt) : 'Never'}</td>
                  <td>
                    {!a.isActive ? (
                      <StatusBadge status="inactive" label="Disabled" />
                    ) : a.hasPassword ? (
                      <StatusBadge status="active" label="Active" />
                    ) : (
                      <StatusBadge status="pending" label="Invited" />
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      disabled={setActive.isPending}
                      onClick={() =>
                        setActive.mutate({ patientId: a.patientId, isActive: !a.isActive })
                      }
                    >
                      {a.isActive ? 'Disable' : 'Enable'}
                    </button>
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

function InviteForm({ onDone }: { onDone: (invite: PortalInvite) => Promise<void> }) {
  const [patientQ, setPatientQ] = useState('');
  const [chosen, setChosen] = useState<Patient | null>(null);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [formErr, setFormErr] = useState<string | null>(null);
  const debounced = useDebounced(patientQ, 300);

  const patients = useQuery({
    queryKey: ['patients', 'lookup', debounced],
    queryFn: async () => {
      const { data } = await api.get<Paginated<Patient>>('/patients', {
        params: { page: 1, pageSize: 20, ...(debounced ? { q: debounced } : {}) },
      });
      return data.data;
    },
  });

  const invite = useMutation({
    mutationFn: async (payload: InvitePortalAccountInput) => {
      const { data } = await api.post<PortalInvite>('/portal-admin/accounts', payload);
      return data;
    },
    onSuccess: onDone,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    const parsed = invitePortalAccountSchema.safeParse({
      patientId: chosen?.id,
      email: blankToUndefined(email),
      phone: blankToUndefined(phone),
    });
    if (!parsed.success) {
      setFormErr(zodMessage(parsed.error));
      return;
    }
    invite.mutate(parsed.data);
  };

  return (
    <form className="card" onSubmit={submit}>
      <h2>Invite a patient</h2>
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
        onSelect={(p) => setChosen(p)}
      />
      {chosen && (
        <p className="muted">
          Inviting <strong>{chosen.firstName} {chosen.lastName}</strong> ({chosen.mrn}).
        </p>
      )}

      <div className="grid">
        <label>
          Email (optional)
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Phone (optional)
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+923001234567"
          />
        </label>
      </div>
      <p className="muted">
        Contact details are only for your own records — the code is shown on
        screen for you to hand over.
      </p>

      {formErr && <div className="alert" role="alert">{formErr}</div>}
      <ErrorNote error={invite.error} fallback="Could not invite this patient" />
      <div className="actions">
        <button type="submit" disabled={invite.isPending || !chosen}>
          {invite.isPending ? 'Inviting…' : 'Create invitation'}
        </button>
      </div>
    </form>
  );
}

// --- appointment requests -----------------------------------------------------

interface RequestRow {
  id: string;
  patientId: string;
  mrn: string;
  patientName: string;
  phone: string;
  doctor: string | null;
  preferredDate: string;
  reason: string | null;
  status: string;
  declineReason: string | null;
  createdAt: string;
}

function RequestsTab() {
  const can = useCan();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('pending');

  const requests = useQuery({
    queryKey: ['portal-admin', 'requests', status],
    queryFn: async () => {
      const { data } = await api.get<RequestRow[]>('/portal-admin/requests', {
        params: status ? { status } : {},
      });
      return data;
    },
  });

  const decline = useMutation({
    mutationFn: async (input: { id: string; reason: string }) => {
      await api.post(`/portal-admin/requests/${input.id}/decline`, {
        reason: input.reason,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['portal-admin', 'requests'] });
    },
  });

  return (
    <div>
      <div className="toolbar">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Status"
        >
          <option value="pending">Pending</option>
          <option value="booked">Booked</option>
          <option value="declined">Declined</option>
          <option value="">All</option>
        </select>
      </div>

      <p className="muted">
        A request is not a booking. Open Appointments to schedule a time, then
        come back and mark the request booked — or decline it with a reason the
        patient will see.
      </p>

      <ErrorNote error={requests.error} fallback="Could not load requests" />
      <ErrorNote error={decline.error} fallback="Could not decline that request" />
      {requests.isPending && <Loading label="Loading requests…" />}
      {requests.data?.length === 0 && (
        <p className="muted">No requests match this filter.</p>
      )}

      {!!requests.data?.length && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Asked</th>
                <th>Patient</th>
                <th>Preferred date</th>
                <th>Doctor</th>
                <th>Reason</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {requests.data.map((r) => (
                <tr key={r.id}>
                  <td>{formatDate(r.createdAt)}</td>
                  <td>
                    {r.mrn} — {r.patientName}
                    <div className="muted">{r.phone}</div>
                  </td>
                  <td>{formatDate(r.preferredDate)}</td>
                  <td>{r.doctor ?? 'Any'}</td>
                  <td>{r.reason ?? '—'}</td>
                  <td>
                    <StatusBadge status={r.status} label={r.status} />
                    {r.declineReason && <div className="muted">{r.declineReason}</div>}
                  </td>
                  <td>
                    {can('appointment:update') && r.status === 'pending' && (
                      <button
                        type="button"
                        disabled={decline.isPending}
                        onClick={() => {
                          const reason = window.prompt(
                            'Why are you declining? The patient will see this.',
                          );
                          if (reason?.trim()) {
                            decline.mutate({ id: r.id, reason: reason.trim() });
                          }
                        }}
                      >
                        Decline
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
