# Roadmap

## Phase 0 — Foundation (this scaffold)

- [x] Monorepo, workspaces, shared package
- [x] Local infra (Postgres, Redis, Adminer, Mailhog)
- [x] API skeleton: config validation, Prisma, tenant context, RBAC guard, audit interceptor
- [x] Web skeleton: routing, API client, auth context, query client
- [x] Docs: architecture, data model, compliance, security
- [ ] `npm install`, first migration, seed verified on a dev machine
- [ ] CI green (lint, typecheck, test, build)

## Phase 1 — MVP: registration + appointments

- [ ] Auth: register/login/refresh/logout, throttling, password reset via email
- [ ] Patients: create, search (name/MRN/phone), view, edit, soft-delete; MRN generator
- [ ] Practitioners: CRUD, weekly schedule templates
- [ ] Appointments: slot generation from schedules, book, reschedule, cancel,
      arrive/fulfil/no-show; overlap prevention
- [ ] Appointment calendar (day/week) and patient timeline in the web app
- [ ] Audit log viewer for `hospital_admin`
- [ ] Postgres RLS migration + tests proving cross-tenant isolation
- [ ] Seed with synthetic Pakistani demographic data
- [ ] E2E happy-path tests

## Phase 2 — Compliance & hardening

- [ ] MFA (TOTP)
- [ ] Consent capture + data-subject export / erasure (anonymise)
- [ ] Break-glass access flow
- [ ] Appointment exclusion constraint (`tstzrange` + `btree_gist`)
- [ ] Audit events shipped to external retention-locked sink
- [ ] Rate-limit tuning, anomaly alerting
- [ ] Terraform for staging + prod; secret manager wiring
- [ ] Backup/restore drill; incident-response runbook
- [ ] Third-party penetration test

## Phase 3 — Clinical core

- [ ] Encounters / visits, clinical notes, problem list
- [ ] Orders (labs, imaging, meds) and results
- [ ] Coding: ICD-10, SNOMED CT, LOINC lookups
- [ ] Document/scan storage (S3-compatible, encrypted)
- [ ] Notifications: SMS (appointment reminders — big value in PK), email

## Phase 4 — Revenue & operations

- [ ] Billing: charge capture, invoices, receipts, payments
- [ ] Insurance / panel claims
- [ ] Pharmacy + inventory
- [ ] Bed / ward management, admissions, discharge
- [ ] Reporting dashboards

## Phase 5 — Interoperability & scale

- [ ] HL7 FHIR R4 facade (read, then write)
- [ ] HL7 v2 ingest for lab/device integrations
- [ ] Keycloak / OIDC migration for SSO + federation
- [ ] BullMQ worker process for async jobs
- [ ] Per-tenant DB split path for large hospitals
- [ ] DICOM / PACS integration for imaging

## Cross-cutting, ongoing

- Accessibility (WCAG 2.2 AA) and Urdu localisation
- Performance budgets on the web app
- Dependency and container image scanning
- Runbooks and on-call
