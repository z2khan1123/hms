import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DELIVERY_HEADER,
  DELIVERY_STATUS_LABELS,
  EVENT_HEADER,
  PERMISSIONS,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  WEBHOOK_EVENT_LABELS,
  createApiKeySchema,
  createWebhookSchema,
  deliveryStatusSchema,
  type ApiKey,
  type ApiKeyCreated,
  type CreateApiKeyInput,
  type CreateWebhookInput,
  type DeliveryStatus,
  type Permission,
  type Webhook,
  type WebhookCreated,
  type WebhookDelivery,
  type WebhookEvent,
} from '@hms/shared';
import { api } from '../lib/api';
import { useCan } from '../lib/permissions';
import { blankToUndefined, formatDateTime } from '../lib/format';
import { ErrorNote, Loading } from '../components/QueryFeedback';
import { StatusBadge } from '../components/StatusBadge';
import { Tabs, type TabDef } from '../components/Tabs';

type TabValue = 'keys' | 'webhooks' | 'deliveries';

const TABS: readonly TabDef<TabValue>[] = [
  { value: 'keys', label: 'API keys' },
  { value: 'webhooks', label: 'Webhooks' },
  { value: 'deliveries', label: 'Deliveries' },
];

const STATUSES = deliveryStatusSchema.options;

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

/** Shown once, never again. */
function SecretOnce({ label, secret }: { label: string; secret: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="card">
      <h3>{label}</h3>
      <p className="alert" role="alert">
        Copy this now. It is stored only as a hash, so it cannot be shown again —
        if it is lost, the only remedy is to issue a new one.
      </p>
      <pre style={{ overflowX: 'auto', userSelect: 'all' }}>{secret}</pre>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(secret);
          setCopied(true);
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

export function IntegrationPage() {
  const can = useCan();
  const [tab, setTab] = useState<TabValue>('keys');

  if (!can('apikey:read') && !can('webhook:read')) {
    return (
      <section>
        <h1>Integration</h1>
        <p className="muted">
          You do not have access to API keys or webhooks. Issuing standing
          credentials is a hospital-admin job.
        </p>
      </section>
    );
  }

  return (
    <section>
      <h1>Integration</h1>
      <p className="muted">
        API keys let other systems read and write here. Webhooks push events out
        to them as they happen.
      </p>
      <Tabs tabs={TABS} value={tab} onChange={setTab} ariaLabel="Integration sections" />
      {tab === 'keys' && <KeysTab />}
      {tab === 'webhooks' && <WebhooksTab />}
      {tab === 'deliveries' && <DeliveriesTab />}
    </section>
  );
}

// --- API keys --------------------------------------------------------------

function KeysTab() {
  const can = useCan();
  const queryClient = useQueryClient();
  const [includeRevoked, setIncludeRevoked] = useState(false);
  const [creating, setCreating] = useState(false);
  const [issued, setIssued] = useState<ApiKeyCreated | null>(null);

  const keys = useQuery({
    queryKey: ['integration', 'api-keys', includeRevoked],
    queryFn: async () => {
      const { data } = await api.get<ApiKey[]>('/integration/api-keys', {
        params: includeRevoked ? { includeRevoked: 'true' } : {},
      });
      return data;
    },
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post<ApiKey>(
        `/integration/api-keys/${id}/revoke`,
        {},
      );
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['integration', 'api-keys'] });
    },
  });

  return (
    <div>
      <div className="toolbar">
        <label style={inlineLabel}>
          <input
            type="checkbox"
            checked={includeRevoked}
            onChange={(e) => setIncludeRevoked(e.target.checked)}
          />
          Show revoked
        </label>
        {can('apikey:manage') && (
          <button type="button" onClick={() => { setCreating((v) => !v); setIssued(null); }}>
            {creating ? 'Close' : 'Issue a key'}
          </button>
        )}
      </div>

      {issued && <SecretOnce label={`Key for ${issued.name}`} secret={issued.secret} />}

      {creating && can('apikey:manage') && (
        <ApiKeyForm
          onDone={async (key) => {
            setCreating(false);
            setIssued(key);
            await queryClient.invalidateQueries({ queryKey: ['integration', 'api-keys'] });
          }}
        />
      )}

      <ErrorNote error={keys.error} fallback="Could not load the API keys" />
      <ErrorNote error={revoke.error} fallback="Could not revoke that key" />
      {keys.isPending && <Loading label="Loading keys…" />}
      {keys.data?.length === 0 && (
        <p className="muted">
          No API keys yet.{can('apikey:manage') && ' Use “Issue a key” to create one.'}
        </p>
      )}

      {!!keys.data?.length && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Prefix</th>
                <th className="num">Scopes</th>
                <th>Last used</th>
                <th>Expires</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {keys.data.map((k) => (
                <tr key={k.id}>
                  <td>
                    {k.name}
                    {k.description && <div className="muted">{k.description}</div>}
                  </td>
                  <td><code>{k.prefix}</code></td>
                  <td className="num" title={k.scopes.join(', ')}>
                    {k.scopes.length}
                  </td>
                  <td>{k.lastUsedAt ? formatDateTime(k.lastUsedAt) : 'Never'}</td>
                  <td>{k.expiresAt ? formatDateTime(k.expiresAt) : 'Never'}</td>
                  <td>
                    {k.revokedAt ? (
                      <StatusBadge status="revoked" label="Revoked" />
                    ) : k.isActive ? (
                      <StatusBadge status="active" label="Active" />
                    ) : (
                      <StatusBadge status="expired" label="Expired" />
                    )}
                  </td>
                  <td>
                    {can('apikey:manage') && !k.revokedAt && (
                      <button
                        type="button"
                        disabled={revoke.isPending}
                        onClick={() => {
                          if (
                            window.confirm(
                              `Revoke "${k.name}"? Anything using it stops working immediately, and this cannot be undone.`,
                            )
                          ) {
                            revoke.mutate(k.id);
                          }
                        }}
                      >
                        Revoke
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

function ApiKeyForm({ onDone }: { onDone: (key: ApiKeyCreated) => Promise<void> }) {
  const [formErr, setFormErr] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [scopes, setScopes] = useState<Permission[]>([]);
  const [filter, setFilter] = useState('');

  // Derived during render — the scope list is long, so it is filtered rather
  // than paged.
  const shown = filter
    ? PERMISSIONS.filter((p) => p.includes(filter.toLowerCase()))
    : PERMISSIONS;

  const create = useMutation({
    mutationFn: async (payload: CreateApiKeyInput) => {
      const { data } = await api.post<ApiKeyCreated>('/integration/api-keys', payload);
      return data;
    },
    onSuccess: onDone,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    const parsed = createApiKeySchema.safeParse({
      name,
      description: blankToUndefined(description),
      scopes,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
    });
    if (!parsed.success) {
      setFormErr(zodMessage(parsed.error));
      return;
    }
    create.mutate(parsed.data);
  };

  return (
    <form className="card" onSubmit={submit}>
      <h2>Issue an API key</h2>
      <p className="muted">
        A key does exactly what you tick here and nothing else — widening a role
        later will not widen this key. Give it the least it needs.
      </p>

      <div className="grid">
        <label>
          Name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Lab analyser, insurer portal"
            required
          />
        </label>
        <label>
          Description
          <input value={description} onChange={(e) => setDescription(e.target.value)} />
        </label>
        <label>
          Expires
          <input
            type="datetime-local"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </label>
      </div>
      <p className="muted">
        A key with no expiry is the one still working after the integration is
        switched off. Set one where you can.
      </p>

      <fieldset>
        <legend>Scopes ({scopes.length} selected)</legend>
        <div className="toolbar">
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter scopes"
            aria-label="Filter scopes"
          />
          <button type="button" onClick={() => setScopes([])}>Clear all</button>
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 4,
            maxHeight: 260,
            overflowY: 'auto',
          }}
        >
          {shown.map((p) => (
            <label key={p} style={inlineLabel}>
              <input
                type="checkbox"
                checked={scopes.includes(p)}
                onChange={(e) =>
                  setScopes((s) =>
                    e.target.checked ? [...s, p] : s.filter((x) => x !== p),
                  )
                }
              />
              <code>{p}</code>
            </label>
          ))}
        </div>
      </fieldset>

      {formErr && <div className="alert" role="alert">{formErr}</div>}
      <ErrorNote error={create.error} fallback="Could not issue this key" />
      <div className="actions">
        <button type="submit" disabled={create.isPending || scopes.length === 0}>
          {create.isPending ? 'Issuing…' : 'Issue key'}
        </button>
      </div>
    </form>
  );
}

// --- webhooks --------------------------------------------------------------

function WebhooksTab() {
  const can = useCan();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [issued, setIssued] = useState<WebhookCreated | null>(null);

  const webhooks = useQuery({
    queryKey: ['integration', 'webhooks'],
    queryFn: async () => {
      const { data } = await api.get<Webhook[]>('/integration/webhooks');
      return data;
    },
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['integration', 'webhooks'] });
  };

  const rotate = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post<WebhookCreated>(
        `/integration/webhooks/${id}/rotate-secret`,
        {},
      );
      return data;
    },
    onSuccess: async (w) => {
      setIssued(w);
      await invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/integration/webhooks/${id}`);
    },
    onSuccess: invalidate,
  });

  return (
    <div>
      {can('webhook:manage') && (
        <div className="toolbar">
          <button type="button" onClick={() => { setCreating((v) => !v); setIssued(null); }}>
            {creating ? 'Close' : 'Add an endpoint'}
          </button>
        </div>
      )}

      {issued && (
        <SecretOnce label={`Signing secret for ${issued.url}`} secret={issued.secret} />
      )}

      {creating && can('webhook:manage') && (
        <WebhookForm
          onDone={async (w) => {
            setCreating(false);
            setIssued(w);
            await invalidate();
          }}
        />
      )}

      <div className="card">
        <h3>How a receiver verifies a delivery</h3>
        <p className="muted">
          Each POST carries <code>{SIGNATURE_HEADER}</code>,{' '}
          <code>{TIMESTAMP_HEADER}</code>, <code>{EVENT_HEADER}</code> and{' '}
          <code>{DELIVERY_HEADER}</code>. Compute
          <code> HMAC-SHA256(secret, "&lt;timestamp&gt;." + rawBody)</code> and
          compare it with the signature header. Reject anything whose timestamp
          is more than a few minutes old — that is what stops an intercepted
          delivery being replayed later.
        </p>
      </div>

      <ErrorNote error={webhooks.error} fallback="Could not load the webhooks" />
      <ErrorNote error={rotate.error} fallback="Could not rotate that secret" />
      <ErrorNote error={remove.error} fallback="Could not delete that endpoint" />
      {webhooks.isPending && <Loading label="Loading webhooks…" />}
      {webhooks.data?.length === 0 && (
        <p className="muted">No endpoints yet.</p>
      )}

      {!!webhooks.data?.length && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Endpoint</th>
                <th className="num">Events</th>
                <th>Last delivery</th>
                <th className="num">Recent failures</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {webhooks.data.map((w) => (
                <tr key={w.id}>
                  <td>
                    <code>{w.url}</code>
                    {w.description && <div className="muted">{w.description}</div>}
                  </td>
                  <td className="num" title={w.events.join(', ')}>
                    {w.events.length}
                  </td>
                  <td>
                    {w.lastDeliveryAt ? (
                      <>
                        {formatDateTime(w.lastDeliveryAt)}
                        {w.lastDeliveryOk === false && (
                          <div className="muted">last one failed</div>
                        )}
                      </>
                    ) : (
                      'Never'
                    )}
                  </td>
                  <td className="num">{w.recentFailures || '—'}</td>
                  <td>
                    <StatusBadge
                      status={w.isActive ? 'active' : 'inactive'}
                      label={w.isActive ? 'Active' : 'Disabled'}
                    />
                  </td>
                  <td>
                    {can('webhook:manage') && (
                      <span className="actions">
                        <button
                          type="button"
                          disabled={rotate.isPending}
                          onClick={() => {
                            if (
                              window.confirm(
                                'Rotate the signing secret? The receiver stops verifying until you give them the new one.',
                              )
                            ) {
                              rotate.mutate(w.id);
                            }
                          }}
                        >
                          Rotate secret
                        </button>
                        <button
                          type="button"
                          disabled={remove.isPending}
                          onClick={() => {
                            if (window.confirm(`Delete ${w.url}?`)) remove.mutate(w.id);
                          }}
                        >
                          Delete
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
    </div>
  );
}

function WebhookForm({ onDone }: { onDone: (w: WebhookCreated) => Promise<void> }) {
  const [formErr, setFormErr] = useState<string | null>(null);
  const [url, setUrl] = useState('https://');
  const [description, setDescription] = useState('');
  const [events, setEvents] = useState<WebhookEvent[]>([]);

  const catalogue = useQuery({
    queryKey: ['integration', 'webhook-events'],
    queryFn: async () => {
      const { data } = await api.get<{ event: WebhookEvent; label: string }[]>(
        '/integration/webhook-events',
      );
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async (payload: CreateWebhookInput) => {
      const { data } = await api.post<WebhookCreated>('/integration/webhooks', payload);
      return data;
    },
    onSuccess: onDone,
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFormErr(null);
    const parsed = createWebhookSchema.safeParse({
      url,
      description: blankToUndefined(description),
      events,
    });
    if (!parsed.success) {
      setFormErr(zodMessage(parsed.error));
      return;
    }
    create.mutate(parsed.data);
  };

  return (
    <form className="card" onSubmit={submit}>
      <h2>Add an endpoint</h2>
      <label>
        URL
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          required
        />
      </label>
      <p className="muted">
        Must be https. Patient data is not going over an unencrypted connection.
      </p>
      <label>
        Description
        <input value={description} onChange={(e) => setDescription(e.target.value)} />
      </label>

      <fieldset>
        <legend>Events ({events.length} selected)</legend>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 4,
          }}
        >
          {(catalogue.data ?? []).map((e) => (
            <label key={e.event} style={inlineLabel}>
              <input
                type="checkbox"
                checked={events.includes(e.event)}
                onChange={(ev) =>
                  setEvents((s) =>
                    ev.target.checked ? [...s, e.event] : s.filter((x) => x !== e.event),
                  )
                }
              />
              {e.label}
            </label>
          ))}
        </div>
      </fieldset>

      {formErr && <div className="alert" role="alert">{formErr}</div>}
      <ErrorNote error={create.error} fallback="Could not add this endpoint" />
      <div className="actions">
        <button type="submit" disabled={create.isPending || events.length === 0}>
          {create.isPending ? 'Saving…' : 'Add endpoint'}
        </button>
      </div>
    </form>
  );
}

// --- deliveries ------------------------------------------------------------

function DeliveriesTab() {
  const can = useCan();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<DeliveryStatus | ''>('');

  const deliveries = useQuery({
    queryKey: ['integration', 'deliveries', status],
    queryFn: async () => {
      const { data } = await api.get<WebhookDelivery[]>('/integration/deliveries', {
        params: status ? { status } : {},
      });
      return data;
    },
    // A retrying delivery changes without anyone clicking, so this refreshes.
    refetchInterval: 20_000,
  });

  const retry = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post<WebhookDelivery>(
        `/integration/deliveries/${id}/retry`,
        {},
      );
      return data;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['integration', 'deliveries'] });
    },
  });

  return (
    <div>
      <div className="toolbar">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as DeliveryStatus | '')}
          aria-label="Status"
        >
          <option value="">Any status</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{DELIVERY_STATUS_LABELS[s]}</option>
          ))}
        </select>
      </div>

      <ErrorNote error={deliveries.error} fallback="Could not load deliveries" />
      <ErrorNote error={retry.error} fallback="Could not retry that delivery" />
      {deliveries.isPending && <Loading label="Loading deliveries…" />}
      {deliveries.data?.length === 0 && (
        <p className="muted">
          Nothing has been sent yet. Events queue up as they happen and are
          delivered in the background.
        </p>
      )}

      {!!deliveries.data?.length && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Queued</th>
                <th>Event</th>
                <th>Status</th>
                <th className="num">Attempts</th>
                <th className="num">Response</th>
                <th>Last error</th>
                <th>Next try</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {deliveries.data.map((d) => (
                <tr key={d.id}>
                  <td>{formatDateTime(d.createdAt)}</td>
                  <td>{WEBHOOK_EVENT_LABELS[d.event] ?? d.event}</td>
                  <td>
                    <StatusBadge
                      status={d.status}
                      label={DELIVERY_STATUS_LABELS[d.status]}
                    />
                  </td>
                  <td className="num">{d.attempts}</td>
                  <td className="num">{d.responseStatus ?? '—'}</td>
                  <td>{d.error ?? '—'}</td>
                  <td>{d.nextAttemptAt ? formatDateTime(d.nextAttemptAt) : '—'}</td>
                  <td>
                    {can('webhook:manage') && d.status !== 'delivered' && (
                      <button
                        type="button"
                        disabled={retry.isPending}
                        onClick={() => retry.mutate(d.id)}
                      >
                        Retry now
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
