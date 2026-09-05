# Security design

## Authentication (MVP)

- Email + password. Passwords hashed with **bcrypt** (cost 12). Never logged,
  never returned.
- **Access token**: JWT, ~15 min TTL, carries `sub` (userId), `tenantId`, `role`.
- **Refresh token**: opaque, random, hashed at rest in `RefreshToken` table,
  ~30 day TTL, rotated on use, revocable.
- Login lockout / throttling via `@nestjs/throttler` on auth routes.
- **MFA (TOTP)** is Phase 2. The `AuthModule` seam keeps this swappable.

### Scale path: Keycloak / OIDC

When we need SSO, per-hospital identity federation, or centrally managed MFA and
password policy, replace the in-app provider with **Keycloak** (self-hosted,
containerised — fits the "portable" goal). The API becomes an OIDC resource
server; `AuthGuard` validates Keycloak-issued JWTs instead of self-issued ones.
Nothing above the `AuthModule` boundary should need to change.

## Authorization — RBAC

Roles (MVP), defined with their permission sets in
`packages/shared/src/rbac.ts`:

| Role              | Scope    | Sample permissions                                  |
| ----------------- | -------- | -------------------------------------------------- |
| `platform_admin`  | platform | manage tenants; no PHI access by default          |
| `hospital_admin`  | tenant   | manage users, all patient & appointment ops       |
| `front_desk`      | tenant   | register patients, book/manage appointments       |
| `practitioner`    | tenant   | read patients, read own appointments, clinical notes |
| `read_only`       | tenant   | read patients & appointments                      |

- Routes declare needs with `@Permissions('patient:create')`.
- `RolesGuard` resolves `req.user.role → Set<permission>` from the shared matrix.
- Least privilege: a new permission defaults to **no role** until explicitly granted.

## Multi-tenant isolation

Defence in depth — see `architecture.md#multi-tenancy`. Summary: JWT `tenantId`
→ `AsyncLocalStorage` → `SET app.current_tenant` → Postgres RLS → plus explicit
`tenantId` in every query.

## Audit trail

- `AuditInterceptor` records every **mutation** and every **PHI read** as an
  `AuditEvent` (actor, action, entity, method, path, ip, outcome, timestamp).
- The table is **append-only**: the application DB role has `INSERT`/`SELECT` only
  — no `UPDATE`/`DELETE` (enforced by a migration `REVOKE`).
- **No PHI in audit `metadata`** — record identifiers and field names, not values.
- Production ships audit events to a separate, retention-locked sink.

## Break-glass (planned, Phase 2)

Emergency access for a practitioner to a patient outside their normal scope:
explicit "break glass" action, reason required, time-boxed grant, high-severity
audit event, and a notification to a compliance mailbox.

## Encryption

- **In transit**: TLS 1.2+ everywhere; HSTS; no plaintext internal hops in prod.
- **At rest**: managed Postgres storage encryption; encrypted, tested backups;
  object storage encryption when added.
- **Field level**: CNIC stored as salted hash + last4 (see `data-model.md`). If a
  feature ever needs the full value, use an encrypted column (envelope encryption
  via the cloud KMS) with its own access grant.

## Application hardening

- `helmet` for security headers; strict CORS allowlist (web origin only).
- Global `ValidationPipe` with `whitelist` + `forbidNonWhitelisted` — unknown
  fields are rejected, not ignored.
- Rate limiting globally, tighter on auth.
- Secrets from the platform secret manager; `.env` is local-only and gitignored;
  boot-time env validation (zod) fails closed.
- Dependency scanning (`npm audit` / Dependabot) in CI.

## Pre-production gates

- [ ] Third-party penetration test.
- [ ] Verified backup restore drill.
- [ ] Incident-response runbook written and rehearsed.
- [ ] Audit-sink retention lock configured.
- [ ] All sub-processor DPAs signed.
