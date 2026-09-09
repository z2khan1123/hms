# Repository audit

A pass over two things: the GitHub and repo setup, and a hunt for defects in
the code. Done on 2026-09-10 against `main` at `aafe66e`, in a worktree, so
nothing here disturbed a running app.

## What was checked, and how

The parts that could be checked mechanically were, because 295 routes and
roughly 130 screens are more than anyone should eyeball:

- **Every client call against every server route.** All 268 `api.*` calls in
  `apps/web` were extracted and matched against all 295 controller handlers,
  normalising `${…}` segments to parameters. 254 matched a literal route; the
  remaining 14 build their path from a variable (`/finance/${kind}`,
  `/registers/${kind}/${id}/registration`, and so on) and each was traced by
  hand to the union type that feeds it. **Every one resolves to a real route.**
  Nothing in the web app calls an endpoint that does not exist.
- **Route shadowing.** For each controller, in declaration order, whether a
  `:param` route is registered before a literal sibling that would then be
  unreachable — the classic way `/ambulance/calls/stats` disappears behind
  `/ambulance/calls/:id`. **Clean.** In every case the literal comes first.
- **Response shapes.** Only one endpoint in the system is paginated
  (`GET /patients`), and all eight callers read `Paginated<Patient>` correctly,
  including `page` / `totalPages` / `total` on the one screen that renders
  pager controls. Of the 268 calls, 12 are typed by an interface declared
  locally in the web app rather than imported from `@hms/shared` — those are
  the ones nothing stops from drifting — and each was diffed against the
  service that answers it. All match.
- **Permissions.** All 295 handlers were checked for `@Permissions`. 267 carry
  one; 21 of the remaining 28 are the portal (guarded by `PortalGuard`, which
  reads its own flag), the analytics controller (guarded at class level) and
  the custom-fields reads (deliberately open, with a stated reason). Then, for
  every page in `sections.ts`, the roles that can open it were compared against
  the permission each API call on that page requires.
- **Secrets.** The tracked tree, and the full history of added files, for
  connection strings, private keys and provider tokens.
- **Docs against code.** Every script named in `README.md`, every claim in
  `docs/integration.md` with a number in it, and the role table in
  `docs/security.md`.
- **The usual defect classes.** Money arithmetic, day boundaries, pagination
  maths, swallowed errors, floating promises, transaction boundaries, unused
  exports.

Verification after every change: `npm run typecheck`, `npm test`,
`npm run build`, `npm run lint`.

## What was fixed

### An API key reached analytics datasets it was never scoped for — `33d80b5`

`AnalyticsService.can` asked `roleHasPermission(user.role, …)` instead of
`callerHasPermission(user, …)`. It was the only place in the API doing so;
`granted.ts` exists precisely so that nothing else asks a caller's *role* what
it may do.

For a person the two agree. For an API key they do not. A key is stored with
`role: 'read_only'` as an audit-trail label — `apikey.service.ts:105` says so
in a comment — and `read_only` holds `payment:read`, `finance:read`,
`staff:read`, `admission:read`, `dispense:read`, `inventory:read` and most of
the rest of the read-only set.

So a key issued the single scope `analytics:read` cleared the controller guard
legitimately, and then `resolve()` waved it through to every dataset backed by
a permission in that set. An integration key handed to a third party to pull
daily patient counts could pull the payments ledger, the income and expense
ledgers, and the staff list. The per-dataset check that the class docstring
promises was, for machine callers, doing the opposite of its job — and
`docs/integration.md` states flatly that "a scoped API key works here exactly
as it does elsewhere", which it did not.

It never surfaced as a bug report because it fails in the quiet direction: the
datasets a key genuinely lacked (payroll among them) were still refused, so
nothing errored. It only ever showed too much.

Three tests were added and were confirmed to fail before the change: a key sees
only the datasets its scopes reach, a hand-crafted query for an unscoped
dataset is refused before any database work, and a signed-in person is still
judged by their role.

### A cheque-date alias with a comment describing a caller that does not exist — `6e73737`

`export const parseChequeDate = parseIsoDateOrNull` at the foot of the OPD
service, under a comment saying it is kept there "so a caller can normalise a
cheque date the same way registration does". Nothing references the name, in
either app. Cheque dates are parsed in the billing service, from the payment
schema, calling the helper directly. The comment was the reason to remove it
rather than leave it: it sends the next reader looking for a relationship
between OPD and cheque dates that has never existed. The import existed only to
feed the alias, so it went too.

## What was found and not fixed

Ranked by how much it matters. Nothing here was changed, because each needs a
decision about the product, or is larger than an audit should quietly reland.

### 1. Four roles are shown a Blood bank Donors tab whose data call 403s

`apps/web/src/pages/BloodBankPage.tsx:43` declares `TABS` as a flat constant,
so the Donors tab renders for anyone who can open `/blood` — the section gate
is `blood:read`. The tab's query is unconditional
(`BloodBankPage.tsx:501`) and `GET /blood/donors` requires `donor:read`
(`bloodbank.controller.ts:55`).

`receptionist`, `doctor`, `nurse` and `accountant` all hold `blood:read` and
none holds `donor:read`. A receptionist clicks Donors and gets a permission
error on a tab the application offered her.

`sections.ts:298` already states the project's position on exactly this:
sending a role somewhere it cannot use "reads as the software being broken
rather than as the permission working". `FrontOfficePage.tsx:96` and
`HrPage.tsx:104` both already gate a tab's body on `can(…)`. This is the same
shape and wants the same treatment — but whether the answer is to hide the tab
or to grant these roles `donor:read` is a decision about who is allowed to see
the donor register, which is not mine to make.

`AmbulancePage.tsx:39` has the identical structure: the Fleet tab is
unconditional, its list query at `AmbulancePage.tsx:560` needs `vehicle:read`,
and `doctor` and `nurse` hold `call:read` without it. (The dispatch form on the
same page is correctly gated on `call:dispatch`, so only the Fleet tab is
exposed.)

### 2. The OPD list and the doctor's queue fetch the practitioner list unconditionally

`apps/web/src/pages/OpdListPage.tsx:44` and
`apps/web/src/pages/DoctorQueuePage.tsx:27` both fire `GET /practitioners` on
mount with no `enabled` guard. That route requires `practitioner:read`.

`accountant`, `pathologist` and `radiologist` hold `opd:read` — so `/opd` and
`/queue` appear in their sidebar — and none of the three holds
`practitioner:read`. All three get a 403 on page load. On the queue screen it is
worse than a blank filter: `DoctorQueuePage.tsx:38` uses that list to
auto-select the signed-in doctor's own practitioner record, so the screen never
settles on a practitioner and the queue stays empty rather than saying why.

Whether a pathologist should be able to read the doctor list, or whether these
roles should simply not be offered the queue, is a matrix decision.

### 3. `docs/row-level-security.md` tells you to set `DIRECT_URL`, which Prisma will ignore

The RLS document's hand-off instructions end with:

```
DATABASE_URL="postgresql://hms_app:<password>@…/neondb?sslmode=require"
DIRECT_URL="postgresql://neondb_owner:…@…/neondb?sslmode=require"
```

immediately under the sentence "Migrations must keep running as the owner:
`hms_app` deliberately cannot create or alter tables, and running DDL as the app
role would hand it the power the separation exists to remove."

But `apps/api/prisma/schema.prisma:15-18` declares only
`url = env("DATABASE_URL")` (line 17).
There is no `directUrl`. Prisma reads `DIRECT_URL` only when the datasource
names it, so setting that variable does nothing at all — `prisma migrate deploy`
would connect as `hms_app` and fail on the first `CREATE TABLE`, which is
confusing in a way that costs an evening, or would succeed if `hms_app` were
over-granted, which is the exact outcome the separation exists to prevent.

This matters more than a normal doc slip because it sits inside the one
procedure that turns RLS on. The fix is either a line in the datasource plus
`DIRECT_URL` in `apps/api/.env.example` and in CI, or a correction to the
document — but adding `directUrl` makes the variable mandatory everywhere, so it
is a change to local dev and CI, not just to a schema file.

### 4. Stock and bed checks are read-then-write at READ COMMITTED

`pharmacy.service.ts:484-505` reads a batch, compares
`line.quantity > batch.quantity` (`:496`), then writes
`batch.quantity - line.quantity` (`:505`). `admissions.service.ts:71` and
`:467` do the same shape for a bed: read, assert free, assign.

Both are inside interactive transactions, and the pharmacy loop deliberately
re-reads each iteration so two lines on one dispense see the running quantity —
that part is right, and commented. But no isolation level is set anywhere in the
codebase, so these run at Postgres' READ COMMITTED default, where two concurrent
transactions both read quantity 10, both find 6 acceptable, and both write 4.
Stock goes negative, or two patients are assigned one bed.

It needs a real window of simultaneity to bite, which on a single hospital's
pharmacy counter is uncommon but not impossible — two counters dispensing the
same fast-moving item. The fix is an atomic guarded update
(`updateMany` with `quantity: { gte: n }` and a check on the returned count) or
a partial unique index for the bed case, and either is a change to clinical
stock handling that wants a deliberate decision rather than an audit's opinion.

### 5. An appointment can be double-booked by reviving a cancelled one

`appointments.service.ts:130-149` (`assertNoClash`) checks for a clash on
create and on reschedule, and the interval test itself is correct
(`startsAt < newEnd AND endsAt > newStart`, `:143-144`). `setStatus`
(`appointments.service.ts:117`) performs no check at all.

`BLOCKING_STATUSES` is `['booked', 'arrived']`. So: cancel the 10:00
appointment, let the slot be booked by someone else, then move the first back to
`arrived` — which `AppointmentsPage.tsx:13` offers as a button on every row
regardless of current status (`:122`). Two blocking appointments, same
practitioner, same time, no error.

The UI cannot set a row back to `booked` (`NEXT_STATUSES` omits it) but it does
offer `arrived`, and `arrived` blocks. The API accepts `booked` from any caller.
The fix is a status transition table, which is a product question about which
moves are legal.

### 6. CI provisions a database for tests that do not exist

`.github/workflows/ci.yml:12-26` runs a `postgres:16` service with a health
check, and `:50-51` pushes the schema into it with `prisma db push`. Nothing
then uses it. All 16 test files are pure unit tests over `*.spec.ts`; the e2e config
(`apps/api/vitest.config.e2e.ts`) matches `*.e2e-spec.ts` and **no file with
that suffix exists anywhere in the repo**. `npm test` never invokes the e2e
config, and CI never invokes `test:e2e`.

So every push and every pull request starts a container and applies a schema for
nothing. Two related loose ends: `test:e2e` cannot pass as written — it lacks
`--passWithNoTests`, so vitest exits non-zero on finding no files — and the API's
lint script is `oxlint src/ test/`, naming a `test/` directory that does not
exist (oxlint tolerates it silently).

Either the database belongs in CI because e2e tests are coming, or it should go.
That is a decision about where the project is heading.

### 7. `docs/github-setup.md` describes a repository that has already been published

The document opens: "The repository has 34 commits on `main` and no remote."
`main` now carries 45 commits and `origin` points at
`https://github.com/z2khan1123/hms.git`. The whole document is a hand-off for
work that is done.

It is not wrong so much as finished — and it is worth keeping, because the
`gh auth login` walkthrough, the `PATH`-in-an-already-open-shell explanation and
the "never commit `apps/api/.env`" section are all still useful. It wants a note
at the top saying the push happened, so nobody re-reads it as a to-do.

### 8. `adjustBillItem` silently clears a discount when the caller omits one

`billing.service.ts:179-185` recomputes the line from
`input.discountBps` / `input.discountMinor` with no fallback to the values
already stored — `priceMinor` and `quantity` both fall back to the row, the two
discount fields do not. `adjustBillItemSchema` makes both optional and only
`discountReason` required, so a request that adjusts `quantity` and nothing else
zeroes an existing discount and raises the patient's bill.

The web app cannot trigger it — `bill-line.ts:51` always sends exactly one of
the two — and the docstring's phrase "whichever discount was given" reads as
though the behaviour is intended. It is listed because the schema permits a
request the code handles surprisingly, which is a trap for the first integration
that adjusts a line over the API.

### 9. Nineteen exports are referenced nowhere in the repository

Beyond the alias removed above: `permissionsForRole` and `BED_STATUS_LABELS`
(`rbac.ts:483`, `ward.ts:32`), `paginatedSchema`, `uuidSchema` and
`PaginationQuery` (`common.ts`), `bpsToPercent` (`money.ts:120`), `formatTime`
(`apps/web/src/lib/format.ts:18`), `getContext` and `getUserId`
(`tenant-context.ts:16` and `:24`), and ten unreferenced type aliases.

Most sit in `@hms/shared`, which is a deliberate contract surface — an unused
schema helper there is a reasonable thing to keep. `getContext` and `getUserId`
are the two worth a second look, because a tenant-context accessor that nothing
calls usually means the intended call site went another way.

## What is clean

Stated plainly because a "no findings" is only useful if you know it was looked
for.

**Secrets.** Nothing. Every `postgresql://` string in the tree is `localhost`
with a placeholder password, a documented `USER:PASS@ep-xxxx` template, or the
CI service's `hms:hms`. No private keys, no provider tokens, no real
connection strings. The full history of added files contains three `.env`
paths and all three are `.env.example`. `.gitignore` covers `.env`, `.env.local`,
`.env.*.local`, `*.pem`, `*.key`, and the derivative patterns `.env.bak`,
`.env.*.bak`, `.env.backup` and `.env.save` — with a comment explaining why a
hand-made backup before an edit is the realistic way a database password gets
committed. That is better than most repositories manage.

**CI correctness.** The workflow would pass as written. `node-version: 24`
agrees with `.nvmrc`; `engines` says `>=22`, which 24 satisfies. `npm ci` picks
up the committed `.npmrc`, so the `legacy-peer-deps` that NestJS 12's peer
ranges require is applied. Every env var the workflow sets satisfies
`env.schema.ts` — both JWT secrets clear the 16-character minimum and the salt
clears 8 — and every value in it is an obvious throwaway (`ci-access-secret-value-change-me`),
not a real credential. All four commands it runs (`lint`, `typecheck`, `build`,
`test`) exist at the root and pass. One redundancy: the API's `postinstall` is
already `prisma generate`, so the explicit "Generate Prisma client" step repeats
work `npm ci` did.

**README.** Every one of the twelve scripts in its table exists, in the
workspace it claims. The URLs are right, including `http://localhost:3000/health`
being outside the `api` global prefix — `main.ts:18` excludes it explicitly. The
long note about two dev stacks racing for port 3000 matches
`scripts/preflight-dev.mjs` and the `predev` / `prestart:dev` hooks that call it.

**`docs/integration.md`.** Checked claim by claim against the code: the retry
schedule "30s, 2m, 8m, 32m, 2h8m" is exactly `30 * 4 ** (attempt - 1)` for the
five delays that `MAX_DELIVERY_ATTEMPTS = 6` allows; "we wait 10 seconds" is
`REQUEST_TIMEOUT_MS = 10_000`; `_count` "capped at 200" is `MAX_COUNT = 200`;
`GET /api/integration/webhook-events` exists. The role table in
`docs/security.md` matches `rbac.ts`.

**Money.** All arithmetic goes through `packages/shared/src/money.ts`, on both
sides. Integer minor units throughout; `roundHalfUp` handles negatives the way
a cashier does. The two places outside it that divide by 100 are display
conversions on values already in minor units. `computeCaseBalance` excludes
reversed payments. `createPaymentInTx` requires the payment to equal the sum of
the lines it settles to the paisa and rejects rather than absorbing a mismatch.
The one division that could produce `NaN` on an empty hospital
(`HomePage.tsx:71`, bed occupancy) is guarded, as is `sharePct` in
`FinancePage.tsx:63`.

**Day boundaries.** `common/util/time-zone.ts` derives the OPD day from the
tenant's IANA zone rather than UTC, and `zonedDayRange` returns a half-open
interval used as `gte` / `lt` — no off-by-one, no double-counted midnight.
Pakistan observes no DST, so computing the offset at a single instant is safe
here.

**Pagination.** `patients.service.ts:130` and `:141`:
`skip: (page - 1) * pageSize`,
`totalPages: Math.max(1, Math.ceil(total / pageSize))`. Correct at the edges,
including an empty result set, and the count runs in `Promise.all` alongside the
page rather than in the array form of `$transaction` that
`docs/row-level-security.md` warns hangs.

**Error handling.** Four `catch {}` blocks in the API, each with a stated
reason: token verification, health probing, and a portal timing-equalisation
path. The six unawaited promises are all deliberate and commented — audit
records, an API-key usage stamp that must never fail a request, the dispatcher's
interval. `SequenceService.next` bumps and reads the counter in one atomic
`update` inside the caller's transaction, so a rollback releases the number.
The webhook payload is queued inside the transaction that caused it, so nothing
escapes on a rollback.

## What is missing that a private commercial repo should have

`.github/` contains only `ci.yml`. Of the usual list, two are worth adding and
the rest are not:

**Dependabot** — worth it. This is healthcare software with its own JWT
handling, HMAC webhook signing and SHA-256 key hashing, and there is no other
mechanism watching for an advisory in that dependency tree. A
`.github/dependabot.yml` covering `npm` (root, grouped) and `github-actions`,
weekly, is a few lines and is the single highest-value file missing.

**An explicit licence statement** — worth it, cheaply. There is no `LICENSE` and
no `license` field in `package.json`. `private: true` stops an accidental
publish, which is the practical risk, so this is not urgent. But "no licence
file" means "no rights granted", and the first time this repository is shown to
a contractor or a prospective buyer, that ambiguity costs a conversation. One
line in `README.md` — proprietary, all rights reserved, © the owner — settles
it.

**Branch protection on `main`, requiring the `verify` job** — not a file, a
GitHub setting, and worth turning on. CI already runs on pull requests; making
it required is what stops a red commit landing. It could not be checked or
changed here: `gh` is installed but not authenticated, and authenticating is
the owner's job.

**CODEOWNERS, CONTRIBUTING, issue and PR templates** — skip all four. CODEOWNERS
routes reviews to teams that do not exist here. CONTRIBUTING duplicates the
README's quick start. Issue and PR templates shape reports from strangers, and
this repository is private with no outside reporters. They are the files people
add because other repositories have them, and each one is another document that
drifts.

One genuinely cheap CI improvement while the file is open: there is no
`concurrency` block, so pushing twice in a minute runs both workflows to
completion against the same branch. Four lines cancel the superseded run.

## What could not be verified

- **Anything requiring a database.** No migration, seed, reset or push was run,
  by instruction. The stock and bed race conditions in finding 4 are read from
  the code and from Postgres' documented default isolation, not reproduced.
- **Anything requiring GitHub.** `gh` is installed and unauthenticated, and was
  left that way. Branch protection, required checks, secret-scanning and
  Dependabot alert status, collaborator access and the repository's actual
  visibility were all read from `docs/github-setup.md` and `git remote`, not
  from the GitHub API. The remote and the branch were confirmed; the settings
  behind them were not.
- **Clinical logic.** The ABO compatibility check in the blood bank, the
  diagnostic reference ranges, the visit stage machine and the payroll
  calculation were read for shape and for how they handle errors, but no attempt
  was made to judge whether the medicine or the labour law is right. Where those
  files appear above it is for a mechanical property — a missing permission, a
  race — never for a clinical one.
- **Behaviour in a browser.** The permission findings are derived from the
  matrix in `rbac.ts`, the guards on the controllers and the gating in the pages.
  What a receptionist actually sees when the Donors query 403s — an error banner,
  an empty table, or a blank tab — depends on `QueryFeedback` and was not
  observed against a running app.
- **`packages/shared`'s unused exports.** Listed as unreferenced within this
  repository. If anything outside it consumes `@hms/shared`, that judgement is
  wrong; nothing here could tell.
