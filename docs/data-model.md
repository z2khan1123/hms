# Data model

## Principles

- **UUID v4 primary keys** everywhere. Never expose sequential integers; they leak
  volume and enable enumeration.
- **`tenantId` on every tenant-scoped table**, first column of most composite indexes,
  protected by RLS (see `architecture.md`). Global reference data (ICD-10) is the
  documented exception.
- **Soft delete** (`deletedAt`) for clinical records — history matters for audit and
  medico-legal reasons; hard delete is a separate, logged, privileged action.
- **Timestamps** `createdAt` / `updatedAt` on everything.
- **FHIR alignment**: entity and field names track the matching FHIR R4 resource so a
  FHIR façade is a mapping exercise, not a migration.

## Money and percentages

**All money is integer minor units** (paisa for PKR) in fields suffixed `Minor`.
**All percentages are integer basis points** in fields suffixed `Bps` — `1800` is
18.00%. There are no floats and no decimals anywhere in the money path.

The arithmetic lives in exactly one place: `packages/shared/src/money.ts`. Both the
API and the web client import `computeChargeLine` and `computeCaseBalance` from it.
This is deliberate — if the two sides ever computed independently, a patient could
see one total on screen and another on the printed receipt.

```
gross    = appliedChargeMinor × quantity
discount = flat discountMinor, or gross × discountBps
tax      = (gross − discount) × taxBps
net      = gross − discount + tax
```

`Tenant.currency` (default `PKR`) drives formatting; nothing in the schema assumes
a currency.

## The Case spine

The clinical record hangs off a **Case**, not directly off the patient. A patient
accumulates cases; a case accumulates visits, charges and payments across every
department. This is what makes "one consolidated bill for this episode" tractable,
and it is the single most important structural decision in the model.

```
Patient ──< Case ──< OpdVisit ──< VisitSymptom / VisitFinding / VisitDiagnosis
                 │              └─< VitalReading
                 ├──< ChargeItem   (may or may not belong to a visit)
                 └──< Payment
```

Balance for a case is `sum(ChargeItem.netMinor) − sum(non-reversed Payment.amountMinor)`.

## Document numbers

Human-facing identifiers are `PREFIX-000001`, generated from per-tenant counters on
`Tenant` inside the same transaction as the row they identify:

| Counter | Prefix field | Applies to |
| --- | --- | --- |
| `mrnSeq` | `mrnPrefix` | Patient MRN |
| `caseSeq` | `casePrefix` | Case number |
| `opdSeq` | `opdPrefix` | OPD visit number |
| `receiptSeq` | `receiptPrefix` | Payment receipt |

Each hospital sets its own prefixes.

## Entities

| Table | FHIR analogue | Notes |
| --- | --- | --- |
| `Tenant` | — | A hospital. No RLS. Holds currency, timezone, number prefixes. |
| `User` | Practitioner / staff | Login identity, one of ten roles. |
| `Practitioner` | Practitioner | A clinician who can be scheduled and consulted. |
| `Patient` | Patient | Demographics, contact, CNIC, allergies, TPA membership. |
| `Tpa` | Organization / Coverage | Insurer or panel that settles the bill. |
| `Case` | EpisodeOfCare | The spine. Snapshots payer terms at open. |
| `Appointment` | Appointment | Booking; may become a visit. |
| `OpdVisit` | Encounter | One outpatient consultation within a case. |
| `VisitSymptom` | Observation | Free text or from the tenant's vocabulary. |
| `VisitFinding` | Observation | As above. |
| `VisitDiagnosis` | Condition | Links a visit to an ICD-10 code; one may be primary. |
| `VitalType` / `VitalReading` | Observation | Reference ranges drive abnormal flagging. |
| `ChargeCategory` / `UnitType` / `TaxCategory` / `Charge` | ChargeItemDefinition | The charge master. |
| `ChargeItem` | ChargeItem | One billed line against a case. |
| `Payment` | PaymentReconciliation | Receipted money in. Reversed, never deleted. |
| `SymptomType` / `Symptom` / `Finding` | — | Tenant-editable clinical vocabulary. |
| `Icd10Group` / `Icd10Code` | CodeSystem | **Global** reference data, not tenant-scoped. |
| `AuditEvent` | AuditEvent | Append-only. No UPDATE/DELETE grant. |

### Charge master

`Charge` belongs to a `ChargeCategory` (which carries the `ChargeTypeKind` — opd,
ipd, pathology, radiology, ambulance, operations, …), optionally a `UnitType`
("per day", "per km") and a `TaxCategory` (a rate in basis points). It holds a
`standardChargeMinor` list price.

A `ChargeItem` **snapshots** the charge's name, type and standard price at the moment
of billing, and records the `appliedChargeMinor` actually charged. Standard vs applied
is how negotiated and TPA pricing is handled without rewriting history when the charge
master changes later.

### Patient identifiers

- **MRN** — the human-facing identifier, unique per tenant.
- **CNIC** — sensitive. Stored as a salted SHA-256 hash plus the last 4 digits for
  lookup and disambiguation, never in plaintext. Search matches on the last 4.

## Not yet modelled

Beds and wards (`Floor → Ward → BedType → Bed`) arrive with IPD in Phase 2. Bed
capacity is tenant data, not a product tier — a seven-bed clinic and a seventy-bed
hospital run the same code and simply enter their own beds in Setup.

## Migrations

Prisma Migrate; migration files committed under `apps/api/prisma/migrations/`. RLS
policies and the audit-table grants are added as raw SQL in a dedicated migration
(Prisma does not model RLS).
