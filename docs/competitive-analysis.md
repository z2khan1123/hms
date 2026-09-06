# Competitive analysis — Smart Hospital

Reference notes from studying the Smart Hospital demo (`demo.smart-hospital.in`) as super
admin on 2026-09-06. It is a mature PHP/CodeIgniter HMS sold as a licensed product, and the
closest thing to a feature benchmark for what we're building.

**Scope of use:** capability and workflow research only. We do not copy their code, assets,
branding, or copy. Feature ideas and workflows are not protectable; their implementation is.

## How the inventory was derived

Their role-permission editor (`/admin/roles/permission/:id`) enumerates every guarded feature
grouped by module, each with View / Add / Edit / Delete. That page is effectively the product's
own specification and is the source for the counts below.

**36 modules · 332 permissioned features · 9 built-in roles · 47 report pages** (plus a
parallel 40-item report set under Multi Branch).

## Module inventory

| Module | Features | Our call |
| --- | ---: | --- |
| IPD — In Patient | 30 | Build |
| OPD — Out Patient | 22 | Build |
| Appointment | 9 | Started |
| Patient | 3 | Started |
| Pathology | 9 | Build |
| Radiology | 9 | Build |
| Blood Bank | 8 | Build |
| Pharmacy | 15 | Build |
| Inventory | 6 | Build |
| Billing | 18 | Build |
| Hospital Charges | 5 | Build |
| Referral | 4 | Build |
| TPA Management | 2 | Build |
| Income | 2 | Build |
| Expense | 2 | Build |
| Human Resource | 13 | Build |
| Duty Roster | 4 | Build |
| QR Code Attendance | 2 | Build |
| Annual Calendar | 1 | Build |
| Front Office | 6 | Build |
| Certificate & ID Cards | 6 | Build (ID cards only) |
| Birth & Death Record | 4 | Build |
| Ambulance | 4 | Build |
| Reports | 47 | Rethink — one analytics layer |
| Multi Branch | 40 | Rethink — real multi-tenancy |
| System Settings | 24 | Started |
| Dashboard & Widgets | 12 | Started |
| Messaging | 3 | Build |
| Two-Factor Authentication | 2 | Build |
| WhatsApp Messaging | 1 | Build |
| Front CMS | 7 | Skip |
| Download Center | 5 | Skip |
| Live Consultation | 3 | Integrate |
| Survey Forms | 2 | Skip |
| Chat | 1 | Skip |
| Calendar / To-Do | 1 | Skip |

Totals: Started 4 · Build 24 · Rethink 2 · Skip 6.

## Data-model findings worth adopting

**The Case ID spine.** The clinical record hangs off a `Case ID`, not directly off the patient.
A patient accumulates cases; a case accumulates visits, charges, investigations, and payments
across every department. Billing reconciles per-case. This is the right abstraction and we
should adopt it — it is what makes "one bill for this admission" tractable.

**Per-module billing.** OPD, IPD, Pharmacy, Pathology, Radiology, Blood Bank and Ambulance
each produce their own bill with line-level `amount → discount (% or flat) → tax (%) → net →
paid → balance`, then roll up against the Case ID. Partial payment is a distinct permission on
every module.

**Charge master.** `Charge` belongs to a `Charge Category`, has a `Charge Type` (OPD, IPD,
Pathology, Radiology, Ambulance, Operations, Investigations, Procedures, Blood Bank, Supplier,
Others, Appointment), a `Unit Type`, a `Tax Category` (%), and a standard charge. A visit picks
a charge and may override with an *applied* charge — standard vs applied is how they handle
negotiated and TPA pricing.

**Bed hierarchy.** `Floor → Bed Group (ward) → Bed Type (Normal/Standard/VIP) → Bed`, with
status Available/Allotted and a per-patient bed history.

### Patient record fields

Name, guardian name, phone, alternate number, gender, date of birth, age (yy-mm-dd), blood
group, marital status, email, address, national identification number, photo, remarks, known
allergies, TPA + TPA ID + TPA validity.

### OPD visit fields

Appointment date, case ID, casualty (y/n), old patient (y/n), reference, apply-TPA, consultant
doctor, charge category → charge → standard charge → applied charge → discount → tax → amount,
payment mode (cash / cheque / bank transfer / UPI / online / other), paid amount, cheque no +
date, attached document, live consultation (y/n), is-antenatal.

Clinical: symptoms type → symptoms title → description; ICD group → ICD-10 diagnosis; note;
known allergies; previous medical issue.

### IPD record tabs

Overview, Nurse Notes, Medication, Prescription, Consultant Register, Lab Investigation,
Operations, Charges, Payments, Live Consultation, Bed History, Timeline, Treatment History,
Vitals. Plus credit limit (limit / used / balance) and per-module billing completion
percentages.

### Custom fields

A field builder attaches user-defined fields to 24 entity types (Ambulance Call, Antenatal,
Appointment, Birth Record, Blood Issue, Component Issue, Death Record, Donor, Expenses, Income,
IPD, Consultant Register, IPD Nurse Note, OPD, OPD Recheckup, Operation, Prescription,
Pathology, Pathology Test, Patient, Pharmacy, Radiology, Radiology Test, Staff). Types:
checkbox, colour picker, date, datetime, input, hyperlink, multi-select, number, dropdown,
textarea. Visibility flags: on table / on print / on report / on patient panel.

This is a genuinely good idea for a product sold to many hospitals with different paperwork,
and worth planning for even if we don't build it early.

## Where we should differ

Detail and rationale in the proposal artifact. Summary:

1. **Clinical decision support** — allergy and drug-interaction checking at prescribing time.
   Theirs stores allergies in a textarea that nothing reads. Largest safety gap in the product.
2. **Pakistan localisation** — Urdu + RTL, CNIC as a validated identifier, PKR, JazzCash /
   Easypaisa / 1LINK. Their nine languages do not include Urdu and their only local-ish rail
   is UPI, which is Indian.
3. **Real scheduling engine** — availability templates, service durations, room/equipment as
   bookable resources, overbooking rules, live OPD token queue.
4. **True multi-tenancy** — tenant column + Postgres RLS, promotable to per-tenant databases.
   Theirs is branches inside one installation with application-level isolation only.
5. **One analytics layer** — saved views, scheduled delivery, export; replaces 87 hardcoded
   report pages.
6. **Offline-tolerant front desk** — registration, billing and vitals queue locally and sync.
7. **Mobile clinician surfaces** — ward round, vitals, notes, e-prescribing on a phone.
8. **Public REST API + webhooks + FHIR façade** — they have no API at all.

## Deliberate scope cuts

Front CMS, internal chat, survey form builder, download centre, personal to-do, generic
certificate builder, and building our own video consultation. 19 features and a permanent
maintenance tax, none of which sells an HMS.

## Their role set

Super Admin, Admin, Doctor, Nurse, Receptionist, Accountant, Pharmacist, Pathologist,
Radiologist — all editable, plus custom roles. Ours currently has five; expand to match this
shape (see `packages/shared/src/rbac.ts`).
