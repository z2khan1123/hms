# Compliance posture — Pakistan

> This is engineering guidance, not legal advice. Engage a Pakistani lawyer with
> health-data / technology experience before go-live and before signing any
> hospital contract.

## Legal landscape (as of 2026)

- Pakistan has **no comprehensive data-protection statute in force**. The
  **Personal Data Protection Bill (PDPB)** has been through multiple drafts and is
  expected to pass; it broadly tracks GDPR (lawful basis, consent, data-subject
  rights, breach notification, a regulator, and restrictions on cross-border
  transfer).
- The **Prevention of Electronic Crimes Act (PECA) 2016** criminalises
  unauthorised access to and disclosure of information systems and data.
- Sector rules from the **Pakistan Medical & Dental Council (PMDC)** and provincial
  healthcare commissions impose confidentiality duties on practitioners and
  facilities.
- Contracts with hospitals will almost certainly impose their own
  confidentiality, retention, and audit requirements — treat those as binding.

## Working assumption

**Build to a GDPR-equivalent bar now.** It satisfies today's contractual
expectations, positions you for the PDPB without a rebuild, and is required anyway
if you later serve patients from the EU/UK or Gulf states.

## What that means concretely (and where it lives in the codebase)

| Requirement                     | Implementation                                              |
| ------------------------------- | --------------------------------------------------------- |
| Lawful basis / consent tracking | `Patient.consent` + consent events (roadmap Phase 2)      |
| Data minimisation               | CNIC optional & hashed; no PHI in logs or audit metadata  |
| Encryption in transit           | TLS 1.2+ terminating at the load balancer; HSTS           |
| Encryption at rest              | Managed Postgres with storage encryption; encrypted backups |
| Access control                  | RBAC + least privilege — `docs/security.md`               |
| Audit trail                     | `AuditEvent`, append-only — `docs/security.md`            |
| Breach detection & response     | Alerting on auth anomalies; documented IR runbook (roadmap) |
| Data-subject access / erasure   | Export + soft-delete/anonymise flows (roadmap Phase 2)    |
| Retention                       | Per-tenant retention policy; default keep clinical records |
| Vendor management               | DPA with each sub-processor (hosting, email, SMS)          |

## Data residency

There is no AWS/GCP/Azure region inside Pakistan. Options, closest first:

- **AWS `me-south-1` (Bahrain)**, **`me-central-1` (UAE)**, **`ap-south-1`
  (Mumbai)**; equivalent GCP/Azure Gulf or India regions.
- **A Pakistani IaaS / colo** (e.g. local providers, PTCL) if a hospital contract
  mandates in-country storage.

Decision driver: what your first hospital contracts require. Keep the deployment
region a configuration choice, not a code assumption — the single-tenant split
path (see `architecture.md`) also covers "this hospital's data must stay in
country X".

## Near-term checklist

- [ ] Register the business entity; open the sub-processor list.
- [ ] Sign DPAs / equivalent with hosting, email, and SMS providers.
- [ ] Draft customer contract with confidentiality, retention, audit, breach-
      notification, and sub-processor clauses; have counsel review.
- [ ] Pick the initial hosting region against first-customer requirements.
- [ ] Write the incident-response runbook.
- [ ] Schedule a third-party penetration test before onboarding real patient data.
