# Row-Level Security

Tenant isolation is enforced twice: every query carries an explicit
`tenantId`, and Postgres refuses to return rows from another tenant even if a
query forgets. This document covers the second half.

## What is in place

Migration `20260908090000_row_level_security` enables and **forces** RLS on 72
tenant-scoped tables, each with the same policy:

```sql
USING      ("tenantId" = current_setting('app.current_tenant', true)::uuid)
WITH CHECK ("tenantId" = current_setting('app.current_tenant', true)::uuid)
```

The policy **fails closed**. `current_setting(..., true)` returns NULL when the
variable is unset, and `"tenantId" = NULL` is never true, so a connection that
has not declared a tenant sees nothing at all. A forgotten `SET` produces an
empty result, never a full table — which is the direction you want to be wrong
in.

`PrismaService` declares the tenant on every query that has one, taking it from
the request's `AsyncLocalStorage` context. `set_config(..., true)` is `SET
LOCAL`: it lasts only for the transaction, so nothing leaks onto a pooled
connection for whoever uses it next.

## The one step that remains

**RLS is not yet enforced against the running application**, because the app
connects as `neondb_owner`, and that role has `rolbypassrls = true`. `BYPASSRLS`
overrides even `FORCE`. Everything else is correct and verified — proven by
connecting as a role without the flag:

| Declared tenant | Rows visible in `Patient` |
| --- | --- |
| none | 0 |
| the real tenant | 2 |
| an unknown UUID | 0 |

To turn enforcement on, point the application at a role that does not bypass.
Run this once, as the owner, choosing your own password:

```sql
CREATE ROLE hms_app LOGIN PASSWORD '<a strong password>' NOBYPASSRLS;

GRANT USAGE ON SCHEMA public TO hms_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hms_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO hms_app;

-- So tables created by future migrations are covered without repeating this.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hms_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO hms_app;
```

Then set `DATABASE_URL` to that role and keep the owner for migrations:

```
DATABASE_URL="postgresql://hms_app:<password>@…/neondb?sslmode=require"
DIRECT_URL="postgresql://neondb_owner:…@…/neondb?sslmode=require"
```

Migrations must keep running as the owner: `hms_app` deliberately cannot create
or alter tables, and running DDL as the app role would hand it the power the
separation exists to remove.

The password is not in this repository, and should not be.

## What is deliberately outside RLS

Six tables, each for a stated reason, repeated in the migration itself and in
`UNSCOPED_MODELS` in `prisma.service.ts` so the two cannot drift:

| Table | Why |
| --- | --- |
| `User` | read by email at login, before any tenant is known |
| `ApiKey` | read by key prefix, before any tenant is known |
| `PatientAccount` | read by MRN at portal login, before any tenant is known |
| `WebhookEndpoint` | read across tenants by the delivery dispatcher |
| `WebhookDelivery` | read across tenants by the delivery dispatcher |
| `AuditEvent` | records events that happen before a tenant resolves, such as a failed login |

The webhook tables are the weakest of these: delivery payloads carry patient
identity, and they are protected by application filtering alone. Closing that
means giving the dispatcher a per-tenant pass over the queue instead of one
cross-tenant sweep. It is a known gap, written down rather than glossed over.

## A hazard worth knowing about

Do not pass Prisma model calls into the array form of `$transaction`.

`PrismaService` extends the client so that each query runs inside a transaction
that declares the tenant. An extended delegate therefore returns a plain
`Promise`, not a `PrismaPromise` — and inside `$transaction([...])` each element
would open a transaction of its own, nested in the outer one, which exhausts
the pool and **hangs rather than failing**. It cost an afternoon to find the
first time.

Use `Promise.all([...])` for independent reads (each gets its own tenant-scoped
transaction), or the interactive form `$transaction(async (tx) => …)` when the
statements genuinely belong together — that form sets the tenant once for the
whole unit of work.

## Cost

One extra round trip per query, for the `BEGIN` / `set_config` / `COMMIT`
around it. Against a database in the same region that is a millisecond or two.
Against a remote development database it is noticeable, and that is a property
of the setup rather than of the design.
