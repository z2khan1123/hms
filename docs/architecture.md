# Architecture

## Goals

- **Multi-tenant SaaS**: one deployment serves many hospitals ("tenants"). Tenant
  data must never leak across the boundary.
- **Portable**: containerised, no hard dependency on a single cloud vendor. Start on
  managed services, keep the door open to self-hosting.
- **Auditable**: every read/write of patient data is attributable to a user and a
  time. This is a design constraint, not a feature.
- **Standards-aware**: core clinical entities are modelled close to HL7 FHIR so a
  FHIR API and external integrations can be added without reshaping the schema.

## High-level shape

```
                       ┌──────────────┐
   Browser  ──────────▶│   web (SPA)  │   React + Vite, served as static assets
                       └──────┬───────┘
                              │ HTTPS, Bearer JWT
                              ▼
                       ┌──────────────┐
                       │   api        │   NestJS — REST, validation, RBAC, audit
                       └──┬────────┬──┘
                          │        │
                   ┌──────▼──┐  ┌──▼──────┐
                   │Postgres │  │ Redis   │   cache, sessions, job queue (BullMQ)
                   │ (Prisma)│  └─────────┘
                   └─────────┘
```

Later additions (see roadmap): object storage (S3-compatible) for documents/scans,
a worker process for async jobs, a FHIR facade.

## Multi-tenancy

**Model chosen: shared database, shared schema, `tenantId` column on every
tenant-scoped table, enforced by Postgres Row-Level Security (RLS).**

Why this model:

- Cheapest to operate for many small/medium hospitals.
- RLS gives defence-in-depth: even a buggy query cannot cross tenants because the
  database itself filters rows.
- Can be split later — a large hospital can be promoted to its own database with
  the same schema and no application rewrite.

How it is enforced, in layers:

1. **Auth** — the JWT carries `tenantId`. No token, no tenant.
2. **Request context** — `TenantContextMiddleware` reads `tenantId` from the
   validated token and stores it in an `AsyncLocalStorage` for the request.
3. **Database session** — `PrismaService` issues `SET app.current_tenant = '<id>'`
   per request/transaction.
4. **RLS policy** — every tenant-scoped table has
   `USING (tenant_id = current_setting('app.current_tenant')::uuid)`.
5. **Application** — services still pass `tenantId` in `where` clauses. Belt and
   braces.

Platform-level rows (the tenant registry, platform staff) live in tables without
RLS and are only reachable by the platform-admin role.

## Request lifecycle (API)

```
HTTP request
  → Helmet (security headers)
  → Rate limiter (@nestjs/throttler)
  → Global ValidationPipe (class-validator DTOs, whitelist + forbid unknown)
  → AuthGuard        verify JWT, attach req.user
  → TenantContext    put tenantId into AsyncLocalStorage
  → RolesGuard       check required permission for the route
  → Controller → Service → Prisma (tenant-scoped)
  → AuditInterceptor writes an AuditEvent for mutating / PHI-read routes
  → HttpExceptionFilter normalises error shape
HTTP response
```

`@Public()` opts a route out of `AuthGuard` (login, health). `@Permissions(...)`
declares what a route needs; `RolesGuard` resolves the caller's role → permission
set from the matrix in `@hms/shared`.

## Auth

MVP uses **in-app authentication**: email + password (bcrypt), short-lived access
JWT + refresh token. Kept behind an `AuthModule` seam so it can be replaced with
**Keycloak / OIDC** when SSO, MFA policy management, and per-hospital identity
federation become requirements. See `docs/security.md`.

## Configuration

`@nestjs/config` loads `apps/api/.env`; a zod schema in
`src/config/env.schema.ts` validates it at boot and the process refuses to start
on invalid config. No secrets in the repo; production secrets come from the
platform's secret manager.

## Shared code

`packages/shared` is the single source of truth for:

- DTO/response **zod schemas** (the web app validates API responses against them),
- **TypeScript types** derived from those schemas,
- the **role → permission matrix**.

Built with `tsup` to ESM + CJS + `.d.ts`; both apps depend on `@hms/shared`.

## Environments

| Env      | Purpose                         | Data                  |
| -------- | ------------------------------- | --------------------- |
| local    | developer machine               | seeded, disposable    |
| staging  | pre-prod, integration testing   | synthetic only        |
| prod     | live                            | real PHI              |

Never copy prod data into lower environments. Use the seed + synthetic generators.

## Deployment (initial)

- `api` and `web` build to containers.
- `web` static assets served by a CDN / static host.
- Managed Postgres + managed Redis in a region close to Pakistan (e.g. AWS
  `me-south-1` Bahrain, `me-central-1` UAE, or `ap-south-1` Mumbai — see
  `docs/compliance-pakistan.md` for the data-residency discussion).
- IaC with Terraform (planned, `infra/` — not yet in repo).
- CI: GitHub Actions (`.github/workflows/ci.yml`) — lint, typecheck, test, build.
