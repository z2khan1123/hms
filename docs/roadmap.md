# Roadmap

Revised 2026-09-06 after benchmarking against Smart Hospital — see
[`competitive-analysis.md`](competitive-analysis.md) for the feature inventory this is scoped
against.

Each phase is ordered to end with something sellable, not with a half-finished layer.

## Phase 0 — Foundation (done)

- [x] Monorepo, workspaces, shared package (zod schemas + RBAC matrix)
- [x] API skeleton: config validation, Prisma, tenant context, RBAC guard, audit interceptor
- [x] Web skeleton: routing, API client with token refresh, auth context
- [x] Postgres on Neon; initial migration applied; seed data
- [x] End-to-end verified: login, patient list, appointment booking, status transitions
- [ ] CI green on a real push
- [ ] Postgres RLS migration + a test proving cross-tenant isolation

## Phase 1 — Front desk and outpatient clinic (months 0–3)

**Sellable as:** a complete system for a single-doctor or small outpatient clinic.

- [ ] Patient master completed to full field set — guardian, CNIC, marital status, blood
      group, photo, allergies, remarks, alternate number, TPA membership
- [ ] MRN generator per tenant; patient bulk import; enable/disable
- [ ] **Case ID spine** — cases own visits, charges, investigations and payments
- [ ] OPD visit: symptoms, findings, ICD-10 diagnosis, notes, previous medical issue
- [ ] Charge master: charge → category → type → unit → tax category; standard vs applied charge
- [ ] Per-visit charges, payments (cash/cheque/bank/online), receipts with print header/footer
- [ ] Scheduling engine: availability templates, service durations, resource booking
- [ ] OPD token queue + waiting-room display
- [ ] Urdu/RTL plumbing (translation ships Phase 2); PKR formatting
- [ ] Role set expanded to match the nine clinical roles

## Phase 2 — Inpatient and the clinical record (months 3–6)

**Sellable as:** a working system for a 20–80 bed hospital.

- [ ] Floor → ward → bed type → bed hierarchy; live bed board; bed history
- [ ] Admission, transfer, discharge, discharge revert; discharge summary
- [ ] Nurse notes, consultant register
- [ ] Vitals with reference ranges and abnormal flagging
- [ ] Medication administration record
- [ ] **Prescribing with allergy + drug-interaction checks**, block-with-logged-override
- [ ] Operation theatre: catalogue, categories, scheduling
- [ ] Antenatal / obstetric history
- [ ] MFA (TOTP), break-glass access flow, consent capture
- [ ] Urdu translation shipped

## Phase 3 — Diagnostics and pharmacy (months 6–9)

**Sellable as:** the three highest-revenue departments in one system.

- [ ] Pathology: test catalogue, categories, parameters with units and reference ranges,
      sample collection, result entry, report templates, billing
- [ ] Radiology: same shape; report templates
- [ ] Pharmacy: medicine master, categories, groups, companies, units, dosage/interval/duration
- [ ] Batch and expiry tracking; expiry reporting; bad stock
- [ ] Purchase and purchase return; suppliers
- [ ] Dispensing against prescriptions; pharmacy billing

## Phase 4 — Revenue cycle and back office (months 9–12)

**Sellable as:** a full hospital operating system.

- [ ] Consolidated billing across all modules against the Case ID
- [ ] TPA / insurance registry, negotiated charges, claims
- [x] Referral registry, commission rules, payouts
- [x] Income and expense ledgers with heads
- [x] HR: staff, departments, designations, attendance, duty roster, leave, payroll, payslips
- [x] General inventory: items, categories, stores, stock, issue
- [x] **Analytics layer** — 14 datasets, saved views, CSV export (replaces hardcoded reports)
      — scheduled delivery still to come

## Phase 5 — Ancillary services and platform (month 12+)

**Sellable as:** feature parity plus the differentiators.

- [x] Blood bank: donors, stock by group, components, issue — with an enforced ABO/Rh
      compatibility check, including the reversed rule for plasma
- [x] Ambulance: vehicle registry, call dispatch, emergency level, billing, response times
- [x] Birth and death registers — Union Council / NADRA registration recorded back;
      a death also marks the patient deceased. Print formats still to come
- [x] Front office: visitor book, call log, postal in/out, complaints
- [x] Patient portal — separate credential space, separate token type, finalised
      reports only. Native mobile app and ID cards not built
- [x] Public REST API + webhooks — scoped API keys, HMAC-signed deliveries with
      bounded retry. See docs/integration.md
- [x] **HL7 FHIR R4 façade** — read-only, 8 resource types, OperationOutcome errors.
      Writes stay on the REST API, where the clinical rules are
- [ ] Offline-tolerant front desk (registration, billing, vitals queue and sync)
- [ ] Custom-field builder
- [ ] Per-tenant database split path for large hospitals

## Explicitly out of scope

Front CMS, internal chat, survey form builder, download centre, personal to-do list, generic
certificate builder. Video consultation is integrated, not built.

## Cross-cutting, ongoing

- Accessibility (WCAG 2.2 AA)
- Performance budgets on the web app
- Dependency and container image scanning
- Third-party penetration test before real patient data
- Runbooks and on-call
