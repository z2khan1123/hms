# HMS — Hospital Management System

Multi-tenant SaaS for hospital operations. First market: **Pakistan**. MVP scope:
**patient registration + appointment scheduling**.

| Layer     | Stack                                                        |
| --------- | ----------------------------------------------------------- |
| Web       | React 19, Vite, TypeScript, React Router, TanStack Query    |
| API       | NestJS 12 (TypeScript, ESM), REST                           |
| Database  | PostgreSQL 16 + Prisma ORM                                  |
| Cache/jobs| Redis 7 (planned: BullMQ)                                   |
| Auth      | In-app JWT + RBAC (swap path: Keycloak — see docs)          |
| Shared    | `@hms/shared` — zod schemas + types + RBAC matrix          |

## Repository layout

```
apps/
  api/          NestJS API
  web/          React web client
packages/
  shared/       Types, zod schemas, role/permission matrix (built with tsup)
docs/           Architecture, data model, compliance, security, roadmap
docker-compose.yml   Local infra: Postgres, Redis, Adminer, Mailhog
```

## Prerequisites

- Node.js 22+ (see `.nvmrc` → 24)
- Docker Desktop (for local Postgres/Redis)
- npm 10+ (bundled with Node)

## Quick start

```bash
# 1. install all workspaces
npm install

# 2. start local infrastructure (Postgres, Redis, Adminer, Mailhog)
cp .env.example .env
npm run infra:up

# 3. configure the apps
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env

# 4. build shared package, generate Prisma client, run migrations, seed
npm run build --workspace=@hms/shared
npm run db:migrate
npm run db:seed

# 5. run everything (api on :3000, web on :5173)
npm run dev
```

Seed creates a demo tenant plus an admin login — see `apps/api/prisma/seed.ts` for
the exact email/password it prints.

## Handy URLs (local)

| Service       | URL                     |
| ------------- | ----------------------- |
| Web app       | http://localhost:5173   |
| API           | http://localhost:3000   |
| API health    | http://localhost:3000/health |
| Adminer (DB)  | http://localhost:8080   |
| Mailhog       | http://localhost:8025   |

## Common scripts (run from repo root)

| Command              | What it does                              |
| -------------------- | ----------------------------------------- |
| `npm run dev`        | Run API + web together                    |
| `npm run dev:api`    | API only (watch mode)                     |
| `npm run dev:web`    | Web only                                  |
| `npm run dev:ports`  | Check whether :3000 / :5173 are already taken |
| `npm run build`      | Build shared → api → web                  |
| `npm run lint`       | Lint all workspaces                       |
| `npm run db:migrate` | Create/apply a Prisma migration           |
| `npm run db:studio`  | Open Prisma Studio                        |
| `npm run db:reset`   | Drop, re-migrate, re-seed                 |
| `npm run infra:down` | Stop local infra                          |

Run **one** dev stack at a time. A second `npm run dev` cannot work: the API
loses the race for port 3000, `nest start --watch` restarts it into the same
collision, and because Vite proxies `/api` to a port nothing is listening on,
sign-in fails with `Request failed with status code 502` — which looks like an
auth bug and is not one. `npm run dev` checks the ports first and stops with an
explanation rather than starting into that state.

`npm run start:dev` inside `apps/api` is guarded the same way, and on its own
port only — so it still runs happily while the web server is up. That gap is
worth naming because it is the one people fall into: the root script was
guarded first, and starting the API directly from its own folder walked
straight past the check.

If you hit the 502, look for duplicate watchers before looking at the code:

```powershell
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Select-Object ProcessId, CommandLine | Format-Table -Wrap
```

More than one `nest start --watch` in that list is the problem.

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — system design, multi-tenancy, request flow
- [`docs/data-model.md`](docs/data-model.md) — entities, FHIR alignment, ID strategy
- [`docs/compliance-pakistan.md`](docs/compliance-pakistan.md) — data-protection posture for Pakistan
- [`docs/security.md`](docs/security.md) — auth, RBAC, audit, encryption, break-glass
- [`docs/roadmap.md`](docs/roadmap.md) — phased plan beyond the MVP
