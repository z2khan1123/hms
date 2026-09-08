# Competitive analysis and product proposal

Revised 2026-09-09. This replaces the earlier Smart Hospital field notes and keeps everything
from them that was directly verified; the module inventory in §2 is still the one derived from
their live demo on 2026-09-06.

**Scope of use.** Capability and workflow research only. No competitor code, copy, asset or
branding is reproduced anywhere in this repository. Feature ideas and clinical workflows are not
protectable; implementations are.

**Provenance.** Facts about our own product come from reading the repository. Facts about Smart
Hospital come from their demo (2026-09-06) and their CodeCanyon listing (fetched 2026-09-09).
Facts about everyone else come from vendor sites, marketplace listings, trade press and
regulator publications, and are flagged where thin. What could not be verified is listed at the
end, deliberately, rather than smoothed over.

---

## 1. What we have

### The inventory

85 Prisma models, 34 enums, 30 API modules, 30 shared contract files, 40 web pages, 28 navigable
sections, 105 permissions across 10 roles. That is a large surface for a product this young, and
the honest reading is that breadth has run ahead of depth in several places.

Built and reachable from the UI: patients; appointments; OPD visits with symptoms, findings and
ICD-10 diagnoses; the case spine; admissions with a floor/ward/bed-type/bed hierarchy and a live
bed board; billing and receipted payments; pharmacy across medicines, batches, purchases and
dispensing; diagnostics as lab and radiology worklists with parameterised report entry; a blood
bank with an enforced ABO/Rh compatibility check; ambulance dispatch; HR covering staff,
attendance, leave, roster and payroll; income and expense ledgers; referrals with commission
payouts; general inventory; front office (visitors, calls, post, complaints); birth and death
registers; an analytics layer over 14 datasets with saved views; a patient portal on its own
credential space; scoped API keys and HMAC-signed webhooks; a read-only FHIR R4 façade over 8
resource types; a custom-field builder; audit logging; and Postgres row-level security across 72
tables.

Not built, and worth stating plainly because most of it is table stakes rather than ambition:
**no user-management UI, no roles editor, no audit-log viewer, no notifications of any kind, no
system-settings screen, no TPA/panel billing, no ID cards, no multi-branch, no messaging, no
Urdu, no operation theatre, no mobile app.** A hospital cannot currently add a receptionist
without a developer, and cannot read the audit trail we are so careful to write.

### The architectural strengths, and why each one is actually worth something

These are not resume items. Each of them removes a class of defect that competitors in this
segment ship with.

**One zod contract, two consumers.** `packages/shared` holds the request/response schemas, the
types derived from them, and the RBAC matrix. The web app validates API responses against the
same schemas the API validates requests with. The usual mid-market failure — a backend field
renamed, a frontend that renders `undefined` for a fortnight until someone notices — is not
available to us.

**The permission matrix is one list, enforced twice.** `rbac.ts` is read by the API's
`RolesGuard` and by `sections.ts`, which drives the sidebar, the landing page and the
after-login redirect. The comment in `sections.ts` records that the sidebar previously kept its
own hardcoded copy and the two had already drifted. The general shape of that bug — a menu item
a role can see and not open — is what makes permissions feel broken to users, and it is
structurally excluded now. A permission not listed for a role is denied; new permissions default
to nobody.

**Row-level security.** Every tenant-scoped table carries a policy keyed off
`app.current_tenant`, and it fails closed: an unset setting yields NULL and matches no rows. A
query that forgets its `where` clause returns nothing rather than another hospital's patients.
Six tables sit outside RLS for stated reasons recorded in the migration itself. This is
defence-in-depth that the application layer cannot undo, and it is the single thing that makes
"multi-tenant SaaS" an honest claim rather than a deployment style.

**Integer money, one arithmetic.** All money is integer minor units in `*Minor` fields, all
percentages integer basis points in `*Bps`. `computeBillLine` and `computeCaseBalance` live in
`money.ts` and are imported by both the API and the web client, so the screen and the printed
receipt cannot disagree. There are no floats in the money path. `data-model.md` also records the
decision to omit a tax term rather than carry a dormant column — that decision has to be
revisited now (see §4, FBR), but it was made deliberately and documented, which is the part that
matters.

**Derive, never store.** Case balance is computed as `sum(BillItem.netMinor) − sum(non-reversed
Payment.amountMinor)`. Payments are reversed, never deleted. Bill items snapshot the service
name, department and suggested price at the time of charging, so editing the service list later
cannot rewrite an old bill. The systems in this segment routinely keep a denormalised `balance`
column and then ship a "recalculate balances" maintenance script, which is an admission that it
drifts.

**A real audit trail.** `AuditEvent` is append-only — the application database role holds INSERT
and SELECT and nothing else, revoked by migration. Metadata carries identifiers and field names,
never values, so the audit log is not a second copy of the PHI.

**Standards posture.** Entity and field names track FHIR R4, so the façade was a mapping
exercise rather than a migration. Read-only is described in `integration.md` as a decision, not a
stage: writes stay on the REST API where the clinical rules live. That is the correct call and
it should stay.

**Two things that are genuinely ahead of the segment.** The blood bank enforces ABO/Rh
compatibility, including the reversed rule for plasma, at issue time — a permission gate plus a
computed check, not a dropdown and a hope. And prescribing/dispensing runs an allergy check:
`Medicine.allergenKeywords`, a `matchAllergy` function in shared, and an `/allergy-check`
endpoint that returns a warning per (medicine, recorded allergy) pair. Be honest about its
limits — it is bidirectional substring matching over name, generic name and keywords, with a
three-character floor. It will catch "penicillin" against "Amoxicillin (penicillin class)" only
if somebody entered that keyword, and it does no drug-drug interaction checking at all. But it
reads the allergy field, which is more than the benchmark does.

**The offline outbox.** Four operations — patient create, OPD visit create, vitals, payment —
queue in IndexedDB with a client-generated idempotency key that the server remembers. The
closed list is the interesting part: `offline.ts` records that queuing "issue this blood unit"
would be queuing a decision made against a stock level that may have changed, which is worse
than refusing. That is the right instinct and it is rare.

---

## 2. Feature by feature against Smart Hospital

Smart Hospital is a PHP/CodeIgniter product sold as a licensed script on CodeCanyon: **$89
regular, $999 extended, version 7.0, last updated 11 August 2026, 2,029 sales**. Multi Branch,
QR Code Attendance, Two-Factor Authentication, WhatsApp Messaging, Survey Form and the SaaS mode
are sold as **separate paid addons**. Their demo's role-permission editor enumerates **36
modules, 332 permissioned features, 9 built-in roles and 47 report pages** (plus a parallel
40-item report set under Multi Branch), which makes that page the product's own specification.

Two-thousand licences sold is not two thousand live hospitals, and the price point tells you
what this is: a script a local integrator buys once, brands, installs on a VPS, and resells with
customisation. That is our real competitor in Pakistan — not the vendor, the integrator.

| Capability | Us | Smart Hospital |
| --- | --- | --- |
| Patient registration | Full demographics, MRN per tenant, CNIC hashed + last 4, allergies, TPA membership fields | Full demographics, national ID in plaintext, TPA membership |
| Case / episode spine | Yes — `Case` owns visits, charges, orders, payments, admissions across departments | Yes — Case ID, the abstraction we adopted from them |
| Appointments | Booking, status transitions, diary | Booking with 9 permissioned features |
| Real scheduling engine (availability templates, service durations, resource booking) | **No** | **No** |
| OPD | Visits, symptoms, findings, ICD-10 diagnoses, vitals, queue | 22 features incl. recheckup, casualty, antenatal flags |
| IPD / admissions | Admit, transfer, discharge, bed board, bed history, nurse notes | 30 features — the deepest module they have; operations, consultant register, credit limit, timeline |
| Operation theatre | **No** | Yes — catalogue, categories, scheduling |
| Pharmacy | Medicines, categories, batches, expiry, purchases, dispensing | 15 features, comparable, plus purchase return |
| Pathology / radiology | Test catalogue with parameters and reference ranges, worklists, report entry, release | 9 + 9 features, report templates |
| Lab analyser interfacing (HL7 v2 / ASTM) | **No** | **No** |
| PACS / DICOM | **No** | **No** |
| Blood bank | Donors, stock, components, issue — **with enforced ABO/Rh compatibility** | 8 features, no compatibility enforcement observed |
| Allergy checking at prescribing | **Yes** — keyword match, warns at prescribe and dispense | Textarea that nothing reads |
| Drug-drug interaction checking | No | No |
| Billing | Consolidated per case, line-level price/discount/net, receipted payments, reversal not deletion | Per-module bills rolled up to the case; partial payment is a distinct permission per module |
| Tax on invoices | **Deliberately omitted** — must now return (§4) | Tax category % per charge |
| Panel / TPA / insurance | **`Tpa` model and payer snapshot on `Case` exist; nothing is built on them** — zero references in the API, contracts or UI | TPA Management module, apply-TPA per visit, standard vs applied charge as the negotiated-price mechanism |
| Charge master | Deliberately none — service list for name consistency, price entered per patient | Charge → category → type → unit type → tax category, standard vs applied |
| Ambulance | Vehicles, dispatch, emergency level, response times, billing | 4 features |
| Front office | Visitors, calls, post, complaints | 6 features |
| Birth / death registers | Yes, with Union Council registration recorded back; a death marks the patient deceased | 4 features |
| HR | Staff, departments, designations, attendance, leave, roster, payroll, payslips | 13 features + duty roster + QR attendance (paid addon) |
| Biometric attendance | **No** | QR code (paid addon); no biometric device ingest found |
| Finance | Income and expense ledgers with heads | Income + expense, 2 features each |
| Referrals | Registry, commission rules, payouts | 4 features |
| Inventory | Items, categories, stores, stock moves | 6 features |
| Reporting | **One analytics layer** — 14 datasets, saved views, CSV export | **47 hardcoded report pages**, plus 40 more under Multi Branch |
| Scheduled report delivery | No | Not observed |
| Custom fields | 7 record types, 6 field types, one shared validator | **24 entity types, 10 field types, visibility flags for table/print/report/patient panel** |
| Patient portal | Separate credential space, separate token type, finalised reports only | Patient panel as a built-in role |
| Patient mobile app | No | Yes (Play Store listing) |
| Messaging (SMS / email / WhatsApp) | **No** | Messaging module + WhatsApp addon (paid) |
| Notifications of any kind | **No** | Yes |
| User management UI | **No** | Yes |
| Roles / permissions editor | **No** — matrix is code | Yes — editable roles, custom roles |
| Audit-log viewer | **No** — events written, not readable | Not observed |
| System settings screen | **No** | 24 features |
| Two-factor authentication | No | Paid addon |
| Multi-branch within one hospital group | **No** | Paid addon, 40 report pages |
| Multi-tenancy | **Shared schema + Postgres RLS, fail-closed, promotable to per-tenant DB** | SaaS mode is a paid addon; isolation is application-level |
| Public REST API | **Yes — scoped API keys** | **None** |
| Webhooks | **Yes — HMAC-signed, bounded retry** | **None** |
| FHIR R4 | **Yes — read-only, 8 resources, OperationOutcome errors** | **None** |
| Offline tolerance | **Yes — IndexedDB outbox + server idempotency, 4 operations** | **No** |
| ID cards / certificates | **No** | Yes — 6 features |
| Live video consultation | No (integrate, don't build) | Zoom integration |
| Front CMS / download centre / chat / surveys / to-do | No, deliberately | Yes |
| Urdu | **No** | **No** — nine languages, Urdu not among them |
| Localisation posture | PKR, Pakistan-first, CNIC-aware | India-first; UPI as the payment rail |

**Where we are genuinely ahead:** integration surface (they have no API at all — this is the
single largest structural difference between the two products), tenant isolation, the money
path, offline tolerance, blood-bank safety, allergy checking, and one analytics layer instead of
87 report pages.

**Where we are genuinely behind:** everything an administrator touches. User management, roles,
settings, audit viewing, notifications, ID cards, multi-branch, TPA, operation theatre, and a
custom-field builder that covers 7 record types against their 24. None of this is hard. All of
it is visible in the first ten minutes of a demo.

---

## 3. Where the wider market is

Seven systems across three tiers, and what each one has that neither we nor Smart Hospital do.

| System | Tier / market | Standout | Standards | Pricing | Criticised for |
| --- | --- | --- | --- | --- | --- |
| **Epic** | US large systems; ~36–43% of US acute care by various counts | App Orchard / SMART on FHIR marketplace, MyChart patient engagement, ambient AI documentation | FHIR R4, TEFCA; reported 2,500+ live third-party apps | Quote-only, eight figures for a large system | Usability, in-basket overload, alert fatigue, documentation burden, market concentration |
| **Oracle Health (Cerner)** | US + international large | Millennium breadth, revenue cycle, national-scale deployments | HL7 v2, FHIR | Quote-only | Migration to OCI mid-flight, delayed and paused deployments, UX historically behind Epic, uncertainty over the next-gen replatform |
| **Meditech Expanse** | US community and critical-access hospitals — the tier closest to our target by size | Web-based, fast implementation, low IT overhead, patient engagement built in | FHIR, Traverse interoperability | Quote-only | Limited customisation, third-party integration friction, analytics considered basic |
| **Insta by Practo** | India + 22 countries, cloud, multi-centre | Configurable forms and reports, OT, RCM, full ancillary set, multi-centre from the ground up | Not publicly detailed | Quote-only, per-user + module add-ons | Quote opacity; module-by-module pricing |
| **KareXpert** | India, 200+ hospitals incl. large groups | HMS + EMR + LIMS + PACS + telemedicine on one stack | Not publicly detailed | Quote-only | Thin public information |
| **Bahmni** (OpenMRS + Odoo + OpenELIS) | Open source; low-resource settings, NGOs, governments; India and Africa | Genuinely integrated EMR + lab + billing + inventory, Docker deployment, real clinical front end | OpenMRS/FHIR ecosystem | Free; cost is implementation | Steep learning curve, heavy to deploy and maintain, weak regional/language coverage, needs in-house DevOps |
| **HospitalRun / GNU Health / Odoo Healthcare** | Open source, small and rural | HospitalRun is explicitly offline-first; Odoo brings a real ERP spine | Varies | Free | Generic ERP does not match hospital workflow out of the box; over-customisation becomes unmaintainable; sparse maintenance |
| **Medstar HIS** (Tashka, Bangalore) | Gulf and India mid-market | **Bilingual Arabic/English throughout**, mobile apps | Not publicly detailed | Quote-only | Thin public information |

What that market has that we and Smart Hospital both lack:

**An app ecosystem, not a feature list.** Epic's answer to "we need X" is that somebody else
builds X against a documented API. We have the API and the FHIR façade — which is the hard,
structural half — and no reason yet for anyone to build against them. That is a positioning
opportunity, not a gap.

**Instrument and device integration.** HL7 v2 / ASTM analyser interfacing and DICOM/PACS are
what separate a laboratory information system from a screen for typing results into. A 200-bed
hospital with a haematology analyser and a CT scanner will ask, and neither product answers. This
is the largest shared blind spot in the comparison.

**Perioperative management.** Operation theatre scheduling, the surgical safety checklist,
anaesthesia records, implant and consumable tracking. Smart Hospital has a shallow version; we
have none. For a 50–300 bed Pakistani private hospital, surgery is a major revenue line.

**Closed-loop medication.** Prescribe → verify → barcode-scan at the bedside → administer →
record. The evidence base for barcode medication administration reducing administration errors
is substantial. Nobody in our segment does it, and it is a credible clinical differentiator that
does not require a licensed drug database to start.

**Real clinical decision support.** Interaction checking, dose range checking and allergy
screening in the enterprise systems ride on licensed knowledge bases — First Databank,
Medi-Span — which are not published-price products and reportedly run from the low five figures
annually into six for large deployments. RxNorm and DrugBank's open DDI content exist as a
cheaper starting point. Our keyword matcher is a good MVP; it is not this.

**Patient engagement as a channel.** MyChart-class portals with reminders, results delivery and
payment. We have a portal; we have no way to tell a patient anything.

**Ambient documentation.** AI scribes are the loud 2026 trend, with reported burnout reductions
within 30 days and native rollouts from Epic, Oracle Health and athenahealth. For our market the
interesting version is not the American one: it is a doctor who speaks Urdu, examines in Urdu,
and is expected to produce an English note.

**Revenue cycle as a discipline.** Claim scrubbing, denial management, ageing, payer performance.
Our billing is a cashier's till; the market's is a revenue cycle.

---

## 4. Gaps that matter for Pakistan specifically

The question this section answers is narrow: what actually blocks a sale to a 50–300 bed private
hospital in Lahore, Karachi or Faisalabad.

**Panel and insurance billing is the biggest single blocker.** A hospital of this size takes a
large share of revenue from corporate panels and health insurers — Jubilee, EFU/Allianz EFU,
Adamjee, State Life and a long tail of corporate accounts — plus, where empanelled, the Sehat
Sahulat card, which covers hospitalisation up to Rs 1 million per family per year across 600+
empanelled hospitals and uses the CNIC as the card. Every one of these needs the same four
things: a payer registry with negotiated tariffs, a split of each bill line into payer share and
patient share, a claim that batches lines and carries a status, and an ageing statement per
payer. We have a `Tpa` model, `Patient.tpaId`/`tpaMemberId`/`tpaValidTill`, and a payer snapshot
on `Case` — and **not one line of code that reads any of it**. The finance office of a hospital
that runs 40% panel business will not adopt a system that cannot tell them what State Life owes
them. This is the gap that loses the deal in the second meeting.

**FBR digital invoicing has moved from optional to regulatory.** SRO 288(I)/2026, issued
18 February 2026, revises the rules for online integration with FBR's computerised system and
names, among other categories, private hospitals and medical care centres providing consultation,
hospitalisation or ancillary services, and pathological laboratories. Reporting describes a
mandatory window extending to July 2026, real-time integration, QR-bearing invoices, a licensing
regime for integrators, and a restriction that no supply be made except through an integrated
outlet or invoicing system. Two consequences for us. First, `data-model.md`'s decision to omit a
tax term — correct at the time, for a private clinic that charges no tax on services — has to be
revisited as an explicit parameter rather than a dormant column, exactly as that document
anticipated. Second, and more interesting: this is a wedge. Most of the installed base is a PHP
script on a VPS that will need bespoke work to comply. An HMS that is already FBR-integrated has
a reason to be bought this year rather than next. *Whether a specific hospital falls in scope
depends on its sales-tax registration and the interaction with provincial services tax; that is
a question for an accountant, not this document.*

**Urdu and RTL.** Smart Hospital ships nine languages and Urdu is not one of them. Medstar HIS
sells into the Gulf on being bilingual Arabic/English throughout. Nobody serving Pakistan has
done the equivalent. The clinical staff will work in English; the receptionist, the ward boy,
the attendant reading a discharge slip and the patient reading an SMS will not. The cost is not
translation — it is retrofitting i18n and RTL layout across 40 existing pages, which gets more
expensive every week we add pages. This is the item whose cost grows fastest if deferred.

**WhatsApp, not SMS.** WhatsApp is the default messaging channel in Pakistan. Utility templates
— which is the category appointment reminders fall in — reportedly price around PKR 2.79 per
message, roughly a fifth of marketing rates, and access is through a Business Solution Provider
rather than direct from Meta. Note the pricing change reported for 1 October 2026, after which
utility templates and service messages inside the customer-service window stop being free; that
affects the unit economics of a chatty design, so design for few, high-value messages.
Appointment reminder, report ready, bill receipt, admission update. That is the list.

**Cash, and the rails around it.** These hospitals are cash-heavy, and the cashier's day ends
with a physical reconciliation. We have `PaymentMode` and receipted payments; what is missing is
the shift: open a till, count in, take money all day, count out, and produce a variance that
someone signs. Separately, Raast is now the only true real-time zero-MDR rail in Pakistan and
supports merchant QR through JazzCash, Easypaisa and bank apps, with SBP having licensed five
fintechs for the Raast Business API. A hospital that can print a Raast QR on the bill and have
the payment reconcile itself is a hospital that stops losing money at the counter. That is a
better use of effort than card integration.

**PMDC registration.** Practitioners are registered with the Pakistan Medical & Dental Council,
and the register is publicly searchable at `online.pmdc.pk` by registration number, name or CNIC,
showing licence validity and qualifications. Our `Practitioner` model should carry the PMDC
number and licence expiry as first-class fields, print it on prescriptions and reports, and warn
when it lapses — a hospital that lets an unregistered doctor sign a report has a problem worth
paying to avoid. *I found a public search page; I could not verify any documented machine-readable
API, so treat this as data entry with a validity date, not a live lookup.*

**Load-shedding and connectivity are an engineering requirement, not an excuse.** Extended power
cuts degrade mobile and internet service directly — telecom sites typically hold one to one and
a half hours of battery, many urban BTS towers have no generator, and P@SHA and GSMA have both
reported revenue losses of 25–30% for digital businesses during major disruptions. Our offline
outbox already covers registration, OPD visit, vitals and payment. The two things it does not
cover and should are the **cashier's receipt print** and **read access to today's patient list
and the current bill**, because the failure mode that actually hurts is not "cannot register" —
it is "cannot tell the patient standing at the counter what they owe."

**Cheap Android hardware.** The ward tablet will be a low-end Android device on a weak Wi-Fi
signal. That is a performance budget and a touch-target constraint on every screen, and it
argues for a PWA over native apps for a long time yet.

**ID cards and biometric attendance.** Both are unglamorous and both come up in every demo.
Pakistani hospitals overwhelmingly run fingerprint attendance terminals; Smart Hospital sells QR
attendance as a paid addon and has no biometric device ingest that I could find. `StaffAttendance`
already exists — what is missing is an endpoint that accepts device pushes and a card designer
that prints a patient MRN barcode and a staff photo card.

---

## 5. Proposal

Ranked within each horizon. The size estimate assumes the architecture as it stands: a new
capability is a Prisma model, a zod contract in `packages/shared`, a NestJS module with
`@Permissions` decorators, and a page registered in `sections.ts` — with RLS, audit, tenancy and
the permission gate arriving for free. That is why several of these are smaller than they look.

### Next (0–3 months) — the things that lose deals today

**1. User and role administration.** Screens to invite, edit, deactivate and reset users, assign
one of the ten roles, and view the permission matrix read-only. *Why it matters:* a hospital that
cannot add its own receptionist has not bought software, it has hired a consultant. This is the
first thing a hospital administrator clicks in a demo and we currently have nothing to show.
*Size: small — one to two weeks.* `User`, `RefreshToken` and the matrix already exist; this is
CRUD plus an invite flow. **Do this first regardless of the ranking below — it is the best
value-per-hour item in this entire document.**

**2. Panel / TPA billing.** Payer registry with negotiated tariffs, payer-share and patient-share
split on each bill line, a `Claim` batching lines with a status lifecycle, payer statements and
ageing. *Why it matters:* it is the largest revenue-side blocker for the target hospital, per §4.
*Size: medium-large — six to eight weeks.* The seams exist and are good ones: `Case` already
snapshots payer terms at open, `BillItem` already carries `approvedWithoutPayment` with an
approver and a reason, and the split arithmetic belongs in `money.ts` next to `computeBillLine`
so both sides compute it identically. The genuinely new work is the claim lifecycle and the
statement, not the billing maths.

**3. Notifications, with WhatsApp first.** A notifications module with a provider adapter, a
template registry, per-tenant channel configuration, and BullMQ delivery with retry. Four
templates to start: appointment reminder, report ready, receipt, admission update. *Why it
matters:* it is the most-requested feature by the commercial side of a Pakistani hospital, it
reduces no-shows in a way a hospital can measure, and it costs pennies per message. *Size:
small-medium — three to four weeks.* Redis and BullMQ are already in the architecture, and the
webhook delivery machinery in `integration.md` already solves signed, retried, bounded delivery —
this is that pattern pointed at a different endpoint.

**4. Urdu and RTL.** i18n plumbing, RTL layout, Urdu translation of the front-desk and
patient-facing surfaces first. *Why it matters:* nobody serving Pakistan has done it, Medstar
proves the Gulf analogue sells, and it is defensible in a way a feature checkbox is not. *Size:
medium — four to six weeks, and growing.* The translation is the cheap part. Retrofitting 40
pages is the cost, and it rises every sprint. Rank it here for that reason alone.

**5. Audit-log viewer and system settings.** A filterable audit view (actor, subject, action,
outcome, date) and a settings screen for the tenant's prefixes, currency, timezone, print header
and footer. *Why it matters:* we write audit events and cannot show them, which turns our
strongest compliance claim into a slide. Settings is where the hospital's name goes on the
receipt. *Size: small — two weeks for both.*

**6. Cashier shift and reconciliation.** Open a till, count in, take payments, count out, record
the variance with an approver. *Why it matters:* it is how a cash-heavy hospital actually closes
the day, and its absence is noticed by the one person whose objection kills a deal — the finance
manager. *Size: small — one to two weeks.*

### Then (3–9 months) — the things that widen the market

**7. FBR digital invoicing.** Invoice-number and QR flow through a licensed integrator, an
outbox that survives a dropped link, and a per-tenant switch. *Why it matters:* it converts a
compliance deadline into a reason to buy now, against an installed base of PHP scripts that will
need bespoke work. *Size: medium — four to six weeks* plus an integrator relationship and an
accountant's opinion on scope. The idempotency and webhook-delivery machinery is most of the
resilience layer already. Ranked here rather than in Next only because the commercial
prerequisite — the integrator — is not a code task.

**8. Operation theatre.** Theatre registry, procedure catalogue, scheduling against surgeon and
theatre as bookable resources, the surgical safety checklist, consumables and implants posted to
the case bill. *Why it matters:* surgery is a major revenue line in a 50–300 bed private
hospital, and it is a hole in our IPD story that a surgeon will find in five minutes. *Size:
medium — five to seven weeks.* It shares a scheduling engine with item 11, and doing that engine
once for both is the reason to sequence them together.

**9. Multi-branch within one tenant.** A branch/location dimension on operational rows, branch
scoping in the permission check, and branch as a filter on every analytics dataset. *Why it
matters:* hospital groups and chains are the larger deals, and our tenant is currently the wrong
grain for one organisation with three sites sharing a patient index. *Size: medium — four to six
weeks*, and cheaper now than after another 20 models exist. Note that this is where we should
deliberately diverge from the benchmark: a branch is a dimension, not a second copy of the
application with its own 40 report pages.

**10. ID cards and biometric attendance.** A card designer for patient and staff cards with MRN
barcode and photo, and an ingest endpoint for fingerprint terminals. *Why it matters:* both are
asked for in every demo, both are cheap, and attendance devices are already installed in these
hospitals. *Size: small-medium — three weeks.* `StaffAttendance` exists; this is an adapter and a
print template.

**11. A real scheduling engine.** Availability templates, service durations, rooms and equipment
as bookable resources, overbooking rules, and a live OPD token queue with a waiting-room display.
*Why it matters:* it is the difference between a diary and a clinic that runs on time, and the
token display is the most visible thing in the building. *Size: medium — four to six weeks*,
shared with item 8.

**12. Scheduled analytics delivery and print templates.** Email a saved view on a schedule;
proper print layouts for receipts, discharge summaries and reports. *Size: small — two weeks.*
High perceived value per hour spent.

### Later (9+ months) — the things that make us hard to replace

**13. Lab analyser interfacing (HL7 v2 / ASTM) and PACS.** An on-premises agent that speaks to
analysers and pushes results into the diagnostics module; Orthanc or an equivalent for DICOM
rather than building a PACS. *Why it matters:* it is the largest shared blind spot in §3 and the
thing a 200-bed hospital's pathologist asks about. *Size: large — this introduces a new
deployment shape (something we ship that runs inside the hospital), which is a bigger commitment
than the code.*

**14. Clinician PWA.** Ward round, vitals, notes, orders and e-prescribing on a cheap Android
phone. Progressive web app, not native — see §4 on hardware. *Size: medium-large.*

**15. Closed-loop medication administration.** Barcode at the bedside against the MAR. *Size:
medium*, and it earns a clinical claim that nobody in this segment can make.

**16. Licensed drug knowledge base.** Replace the keyword matcher with real interaction, dose
and allergy screening. *Size: small in code, large in money* — five to six figures annually, per
§3. Do this when a customer will pay for it, and not before. RxNorm/DrugBank open content is the
intermediate step.

**17. Urdu-English ambient clinical documentation.** The interesting local version of the loud
global trend: dictate in Urdu, produce a structured English note. *Size: large, and speculative.*
Worth a prototype only after the boring items above are done, because it is the kind of thing
that wins a conference talk and loses a year.

**18. FHIR write and SMART on FHIR.** Only when a named integration partner asks. Read-only is a
decision, per `integration.md`, and it should stay one until someone pays to change it.

**19. Per-tenant database split.** Already on the roadmap; it becomes urgent the day a large
hospital's contract demands it, and not before.

### Not worth building

State this plainly so it does not get relitigated every quarter.

**Front CMS, download centre, internal chat, survey builder, personal to-do, annual calendar, and
a generic certificate builder.** Roughly 19 features in the benchmark, a permanent maintenance
tax, and not one of them has ever sold a hospital information system. The hospital already has a
website and WhatsApp.

**Our own video consultation.** Integrate Zoom or a WebRTC provider. Building it is a video
company, not an HMS.

**Hardcoded report pages.** We have the analytics layer; every request for "a report" is a saved
view. Adding the first hardcoded report page reopens the road to 87 of them.

**A curated drug database of our own.** Licence one or use open data. Curating drug knowledge is
a full-time clinical safety function and we would be doing it badly.

**Native iOS and Android apps** before the PWA has proved demand. Two more build pipelines and
two more app-store review queues for a surface we have not yet validated.

**Chasing HIPAA.** It is the wrong regime — there is no such thing as HIPAA certification, and
the relevant bars here are the contractual ones plus the PDPB when it lands. `compliance-pakistan.md`
already has this right: build to a GDPR-equivalent bar and stop.

---

## 6. What not to copy

**Branch as a substitute for tenancy.** Their multi-branch addon is application-level scoping
inside one installation, and it drags 40 duplicate report pages behind it. Ours is a tenant
column with a fail-closed database policy and a documented path to a per-tenant database. Do not
let multi-branch (item 9) erode that — a branch is a dimension on a row, not a second application.

**Selling security as an addon.** Two-factor authentication is a separately purchased addon in
their catalogue. Charging extra for MFA is charging extra for not being breached. MFA, audit and
the API stay in the base product; if we ever tier the product, tier it on capacity and modules,
never on security.

**Feature count as the marketing axis.** 332 permissioned features and 87 report pages is a
number, not a product. Every one of those is a screen somebody has to maintain and a receptionist
has to learn. Our pitch is a shorter list that is correct: the bill cannot disagree with the
receipt, the blood cannot be issued to the wrong group, another hospital's data cannot be
returned by a query, and the data can be got out through an API.

**Allergies as a textarea.** They store known allergies in free text that nothing ever reads.
This is the largest patient-safety gap in the benchmark, and the one place where doing it
properly is both cheap and morally non-optional. Ours is crude but it is wired in; keep improving
it rather than adding modules alongside it.

**The charge master.** `data-model.md` records that an earlier draft copied their charge
categories, unit types, tax categories and standard-versus-applied pricing, and that it was
rejected as over-built for a private clinic. That judgement was right. When panel pricing arrives
(item 2), resist the temptation to reintroduce the whole apparatus — a negotiated tariff per
payer is one table, not five.

**Per-module bills the user reconciles mentally.** They generate a separate bill in OPD,
pharmacy, pathology, radiology, blood bank and ambulance, each with its own completion
percentage, rolled up to the case. We compute one balance from the ledger of lines and payments.
Keep it that way; the moment a module owns its own bill total, the totals start to drift.

**No API.** Their product has none. Ours has scoped keys, signed webhooks and a FHIR façade.
That is the difference between software a hospital can build on and software a hospital is stuck
inside, and it should be the headline of every technical conversation.

---

## What I could not verify

Stated so nobody builds a plan on it.

- **Smart Hospital's installed base.** 2,029 CodeCanyon sales are licences, not live hospitals,
  and say nothing about how many run in Pakistan. Their real distribution is through local
  integrators, which is not publicly countable.
- **What version 7.0 changed.** The demo inventory in §2 was taken on 2026-09-06; the listing now
  reads version 7.0, updated 11 August 2026. The module counts may already be stale.
- **Enterprise pricing** for Epic, Oracle Health, Meditech, Insta and KareXpert. All quote-only.
  Any figure quoted for these is a secondary-source estimate, not a price.
- **A machine-readable PMDC API.** A public search page exists at `online.pmdc.pk`. I found no
  documented API, so item in §4 assumes manual entry with a validity date.
- **FBR scope for a given hospital.** SRO 288(I)/2026 names private hospitals and medical care
  centres. Whether a particular hospital is in scope turns on its sales-tax registration and the
  interaction with provincial services sales tax, and the deadline reporting comes from secondary
  sources rather than the SRO text itself. Get an accountant's opinion before promising
  compliance to a customer.
- **Sehat Sahulat's operational status province by province in 2026.** Coverage, funding and
  suspensions have varied; secondary reporting is inconsistent.
- **Claim file formats used by Pakistani insurers.** Almost certainly portal upload or
  spreadsheet rather than EDI, but I could not confirm any specification, so item 2 should be
  designed around an exportable statement plus a per-payer adapter, not a standard.
- **Whether Smart Hospital's blood bank enforces ABO/Rh compatibility.** Not observed in the demo
  session; recorded above as "no compatibility enforcement observed", which is weaker than "none".
- **Current release health of Bahmni and HospitalRun.** Both are described in secondary sources;
  I did not check commit activity or release cadence.
