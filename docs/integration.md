# Integrating with the HMS API

Everything the web app does is done over the same REST API, and an outside
system can do it too. Issue an API key, give it the least it needs, and call
the same endpoints.

## Authenticating

Two credentials exist, and they are not interchangeable.

**A person** signs in and gets a short-lived JWT. Their authority comes from
their role and moves whenever the role moves.

**A machine** presents an API key. Its authority is the explicit list of scopes
it was issued with and never moves — widening the pathologist role does not
widen a key somebody issued last year to read lab results. This is deliberate:
a credential that silently gains powers is a credential nobody can reason about.

Send the key either way:

```
X-API-Key: hms_a1b2c3d4_<secret>
```

```
Authorization: ApiKey hms_a1b2c3d4_<secret>
```

The key is `hms_<handle>_<secret>`. The handle identifies the row; the secret
is compared against a SHA-256 hash. SHA-256 rather than bcrypt on purpose — the
secret is 256 bits of randomness, so there is no dictionary to attack, and
bcrypt's designed slowness would land on every request instead of once per
login. The comparison is constant-time.

### Issuing a key

Setup → Integration → API keys, as a hospital admin. Pick scopes deliberately;
the form lists every permission in the system and a key should hold a handful.

**The secret is shown once.** It is stored only as a hash, so it cannot be
retrieved — if it is lost, revoke the key and issue another. Revocation is
immediate and permanent.

Set an expiry where you can. A key with no expiry is the one still working long
after the integration was switched off.

### What a refusal means

- `401` — the key is unknown, tampered with, revoked, or expired. The API does
  not say which, because an error that distinguishes them is an oracle for
  guessing valid handles.
- `403 This API key is missing scope(s): …` — the key is fine; it was not
  issued that scope.

## Webhooks

Rather than polling, register an endpoint and we will POST to it.

### Guarantees

- **At-least-once.** A delivery is only marked delivered after a 2xx. Build
  your receiver to tolerate seeing the same `x-hms-delivery` id twice.
- **Never blocking.** The delivery row is written inside the transaction that
  caused it and sent afterwards by a separate dispatcher. Your endpoint being
  down, slow, or hostile cannot fail or delay the clinical action that
  triggered the event. If that transaction rolls back, no event escapes.
- **Bounded retries.** 30s, 2m, 8m, 32m, 2h8m — then abandoned, and visible in
  the Deliveries tab where it can be retried by hand. Retrying for ever would
  turn an unreachable endpoint into a disk-space incident.
- **https only.** We will not post patient data over an unencrypted connection.

### Verifying a delivery

Every POST carries:

| Header | Meaning |
| --- | --- |
| `x-hms-signature` | HMAC-SHA256, hex |
| `x-hms-timestamp` | Unix seconds |
| `x-hms-event` | e.g. `patient.created` |
| `x-hms-delivery` | Delivery id, stable across retries |

Compute `HMAC-SHA256(secret, "<timestamp>." + rawBody)` and compare with the
signature header. Sign the **raw body**, not a re-serialised object — key order
will differ and the signature will not match.

```js
import { createHmac, timingSafeEqual } from 'node:crypto';

function verify(rawBody, headers, secret) {
  const ts = headers['x-hms-timestamp'];
  // The timestamp is inside the signed string, so an intercepted delivery
  // cannot be replayed later with a fresh one. Reject stale deliveries.
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;

  const expected = createHmac('sha256', secret)
    .update(`${ts}.${rawBody}`)
    .digest('hex');
  const got = headers['x-hms-signature'] ?? '';
  if (expected.length !== got.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(got));
}
```

Answer `2xx` quickly and do your work afterwards. We wait 10 seconds.

### Payload

```json
{
  "id": "<delivery id>",
  "event": "patient.created",
  "createdAt": "2026-09-08T12:00:00.000Z",
  "data": { "patientId": "…", "mrn": "DMO-000123", "…": "…" }
}
```

Payloads carry identity and the fact that happened — not the clinical record.
Fetch what you need over the API with a scoped key.

### Events

The list is closed on purpose. An open one is a promise to notify on
everything, and then every new column is a breaking change to somebody's
integration. `GET /api/integration/webhook-events` returns the current
catalogue.

### Rotating a secret

Rotation is immediate: the old secret stops verifying at once. Plan a moment
for it, or accept a gap in which your receiver rejects deliveries — they will
retry, so a short gap is survivable.

## Operational notes

The dispatcher runs as an interval inside the API process. That is honest about
what it is: correct for a single node, and the thing to replace with a real
queue when this runs on several. Each attempt is claimed with a conditional
update, so two processes racing on the same row cannot both send it.
