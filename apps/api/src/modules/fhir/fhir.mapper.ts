import type {
  Address,
  CodeableConcept,
  ContactPoint,
  FhirCondition,
  FhirDiagnosticReport,
  FhirEncounter,
  FhirMedicationRequest,
  FhirObservation,
  FhirOrganization,
  FhirPatient,
  FhirPractitioner,
  Quantity,
} from './fhir.types.js';

/**
 * Mapping our records onto FHIR R4.
 *
 * The rule throughout: emit a field only when we genuinely have it. A resource
 * padded out with plausible-looking defaults is worse than a sparse one,
 * because a consumer cannot tell an actual value from a placeholder.
 */

// --- terminology -----------------------------------------------------------

/** UCUM. The unit system FHIR expects for a Quantity. */
const UCUM = 'http://unitsofmeasure.org';
const ICD10 = 'http://hl7.org/fhir/sid/icd-10';
const ACT_CODE = 'http://terminology.hl7.org/CodeSystem/v3-ActCode';
const OBS_CATEGORY = 'http://terminology.hl7.org/CodeSystem/observation-category';
const CONDITION_CLINICAL =
  'http://terminology.hl7.org/CodeSystem/condition-clinical';
const CONDITION_VER =
  'http://terminology.hl7.org/CodeSystem/condition-ver-status';
const INTERPRETATION =
  'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation';
const IDENTIFIER_TYPE = 'http://terminology.hl7.org/CodeSystem/v2-0203';
const MARITAL = 'http://terminology.hl7.org/CodeSystem/v3-MaritalStatus';

/** Our identifier namespaces, derived from the deployment's own base URL. */
export function mrnSystem(base: string): string {
  return `${base}/fhir/identifier/mrn`;
}
export function visitSystem(base: string): string {
  return `${base}/fhir/identifier/visit-no`;
}
export function admissionSystem(base: string): string {
  return `${base}/fhir/identifier/admission-no`;
}

const ref = (type: string, id: string, display?: string) => ({
  reference: `${type}/${id}`,
  ...(display ? { display } : {}),
});

/** FHIR flags an out-of-range result with these codes, not with our words. */
function interpretationOf(flag: 'low' | 'normal' | 'high' | null): CodeableConcept[] | undefined {
  if (!flag) return undefined;
  const map = {
    low: { code: 'L', display: 'Low' },
    normal: { code: 'N', display: 'Normal' },
    high: { code: 'H', display: 'High' },
  } as const;
  return [{ coding: [{ system: INTERPRETATION, ...map[flag] }] }];
}

function quantity(value: number, unit: string | null): Quantity {
  // `unit` is the human label; `code` is the UCUM symbol. We only have one
  // string, so it fills both — honest, and it is what the lab actually printed.
  return {
    value,
    ...(unit ? { unit, system: UCUM, code: unit } : {}),
  };
}

// --- Patient ---------------------------------------------------------------

const MARITAL_CODES: Record<string, { code: string; display: string }> = {
  single: { code: 'S', display: 'Never Married' },
  married: { code: 'M', display: 'Married' },
  widowed: { code: 'W', display: 'Widowed' },
  separated: { code: 'L', display: 'Legally Separated' },
};

export interface PatientSource {
  id: string;
  mrn: string;
  firstName: string;
  lastName: string;
  gender: 'male' | 'female' | 'other' | 'unknown';
  birthDate: Date;
  phone: string;
  alternatePhone: string | null;
  email: string | null;
  address: unknown;
  maritalStatus: string | null;
  status: string;
  updatedAt: Date;
  deathRecord?: { diedAt: Date } | null;
}

export function toFhirPatient(
  p: PatientSource,
  base: string,
  tenantId: string,
): FhirPatient {
  const telecom: ContactPoint[] = [
    { system: 'phone', value: p.phone, use: 'mobile' },
  ];
  if (p.alternatePhone) telecom.push({ system: 'phone', value: p.alternatePhone });
  if (p.email) telecom.push({ system: 'email', value: p.email });

  const addr = p.address as { line1?: string; line2?: string; city?: string; country?: string } | null;
  const address: Address[] | undefined = addr
    ? [
        {
          use: 'home',
          line: [addr.line1, addr.line2].filter((v): v is string => !!v),
          ...(addr.city ? { city: addr.city } : {}),
          ...(addr.country ? { country: addr.country } : {}),
        },
      ]
    : undefined;

  const marital = p.maritalStatus ? MARITAL_CODES[p.maritalStatus] : undefined;

  return {
    resourceType: 'Patient',
    id: p.id,
    meta: { lastUpdated: p.updatedAt.toISOString() },
    identifier: [
      {
        use: 'official',
        system: mrnSystem(base),
        value: p.mrn,
        type: {
          coding: [{ system: IDENTIFIER_TYPE, code: 'MR', display: 'Medical record number' }],
        },
      },
    ],
    // `active` is about the record, not the person. A deceased patient's record
    // is still active; `deceased` is what says they died.
    active: p.status !== 'inactive',
    name: [
      {
        use: 'official',
        text: `${p.firstName} ${p.lastName}`.trim(),
        family: p.lastName,
        given: [p.firstName],
      },
    ],
    telecom,
    gender: p.gender,
    birthDate: p.birthDate.toISOString().slice(0, 10),
    // Emitted only when we actually know. Sending `deceasedBoolean: false` for
    // every patient would assert something we have not established.
    ...(p.deathRecord
      ? { deceasedDateTime: p.deathRecord.diedAt.toISOString() }
      : p.status === 'deceased'
        ? { deceasedBoolean: true }
        : {}),
    ...(address ? { address } : {}),
    ...(marital
      ? { maritalStatus: { coding: [{ system: MARITAL, ...marital }] } }
      : {}),
    managingOrganization: ref('Organization', tenantId),
  };
}

// --- Practitioner and Organization -----------------------------------------

export function toFhirPractitioner(p: {
  id: string;
  firstName: string;
  lastName: string;
  specialty: string | null;
  isActive: boolean;
  updatedAt: Date;
}): FhirPractitioner {
  return {
    resourceType: 'Practitioner',
    id: p.id,
    meta: { lastUpdated: p.updatedAt.toISOString() },
    active: p.isActive,
    name: [
      {
        use: 'official',
        text: `${p.firstName} ${p.lastName}`.trim(),
        family: p.lastName,
        given: [p.firstName],
      },
    ],
  };
}

export function toFhirOrganization(t: {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  updatedAt: Date;
}): FhirOrganization {
  return {
    resourceType: 'Organization',
    id: t.id,
    meta: { lastUpdated: t.updatedAt.toISOString() },
    identifier: [{ system: 'urn:hms:tenant-slug', value: t.slug }],
    active: t.isActive,
    name: t.name,
  };
}

// --- Encounter -------------------------------------------------------------

/** Our OPD statuses onto FHIR's encounter lifecycle. */
const OPD_STATUS: Record<string, FhirEncounter['status']> = {
  registered: 'planned',
  waiting: 'arrived',
  in_consultation: 'in-progress',
  completed: 'finished',
  cancelled: 'cancelled',
};

const ADMISSION_STATUS: Record<string, FhirEncounter['status']> = {
  admitted: 'in-progress',
  discharged: 'finished',
  cancelled: 'cancelled',
};

export function opdVisitToEncounter(
  v: {
    id: string;
    opdNo: string;
    patientId: string;
    practitionerId: string | null;
    status: string;
    visitAt: Date;
    updatedAt: Date;
  },
  base: string,
): FhirEncounter {
  const status = OPD_STATUS[v.status] ?? 'planned';
  return {
    resourceType: 'Encounter',
    id: v.id,
    meta: { lastUpdated: v.updatedAt.toISOString() },
    identifier: [{ system: visitSystem(base), value: v.opdNo }],
    status,
    // AMB is FHIR's code for an ambulatory (outpatient) encounter.
    class: { system: ACT_CODE, code: 'AMB', display: 'ambulatory' },
    subject: ref('Patient', v.patientId),
    ...(v.practitionerId
      ? { participant: [{ individual: ref('Practitioner', v.practitionerId) }] }
      : {}),
    period: {
      start: v.visitAt.toISOString(),
      // An encounter that is finished ended; one still open has no end, and
      // inventing one would misreport a patient as gone.
      ...(status === 'finished' || status === 'cancelled'
        ? { end: v.updatedAt.toISOString() }
        : {}),
    },
  };
}

export function admissionToEncounter(
  a: {
    id: string;
    admissionNo: string;
    patientId: string;
    admittedById: string | null;
    status: string;
    admittedAt: Date;
    dischargedAt: Date | null;
    updatedAt: Date;
  },
  base: string,
): FhirEncounter {
  return {
    resourceType: 'Encounter',
    id: a.id,
    meta: { lastUpdated: a.updatedAt.toISOString() },
    identifier: [{ system: admissionSystem(base), value: a.admissionNo }],
    status: ADMISSION_STATUS[a.status] ?? 'in-progress',
    // IMP: inpatient encounter.
    class: { system: ACT_CODE, code: 'IMP', display: 'inpatient encounter' },
    subject: ref('Patient', a.patientId),
    ...(a.admittedById
      ? { participant: [{ individual: ref('Practitioner', a.admittedById) }] }
      : {}),
    period: {
      start: a.admittedAt.toISOString(),
      ...(a.dischargedAt ? { end: a.dischargedAt.toISOString() } : {}),
    },
  };
}

// --- Observation -----------------------------------------------------------

export function vitalToObservation(v: {
  id: string;
  patientId: string;
  opdVisitId: string | null;
  admissionId: string | null;
  value: number;
  flag: 'low' | 'normal' | 'high' | null;
  recordedAt: Date;
  vitalType: { name: string; unit: string; refLow: number | null; refHigh: number | null };
}): FhirObservation {
  const encounterId = v.opdVisitId ?? v.admissionId;
  const range =
    v.vitalType.refLow !== null || v.vitalType.refHigh !== null
      ? [
          {
            ...(v.vitalType.refLow !== null
              ? { low: quantity(v.vitalType.refLow, v.vitalType.unit) }
              : {}),
            ...(v.vitalType.refHigh !== null
              ? { high: quantity(v.vitalType.refHigh, v.vitalType.unit) }
              : {}),
          },
        ]
      : undefined;

  return {
    resourceType: 'Observation',
    id: v.id,
    meta: { lastUpdated: v.recordedAt.toISOString() },
    // A recorded vital is final: it is what was measured, and it does not
    // later get revised the way a lab result can.
    status: 'final',
    category: [
      {
        coding: [{ system: OBS_CATEGORY, code: 'vital-signs', display: 'Vital Signs' }],
      },
    ],
    // Text only. We do not hold LOINC codes, and inventing them would be worse
    // than saying plainly what the hospital calls this measurement.
    code: { text: v.vitalType.name },
    subject: ref('Patient', v.patientId),
    ...(encounterId ? { encounter: ref('Encounter', encounterId) } : {}),
    effectiveDateTime: v.recordedAt.toISOString(),
    valueQuantity: quantity(v.value, v.vitalType.unit),
    ...(interpretationOf(v.flag) ? { interpretation: interpretationOf(v.flag) } : {}),
    ...(range ? { referenceRange: range } : {}),
  };
}

export function diagnosticValueToObservation(
  d: {
    id: string;
    name: string;
    unit: string | null;
    valueText: string | null;
    valueNumber: number | null;
    flag: 'low' | 'normal' | 'high' | null;
    refLow: number | null;
    refHigh: number | null;
    refText: string | null;
    createdAt: Date;
  },
  report: { patientId: string; reportedAt: Date | null; serviceOrderId: string },
): FhirObservation {
  const range =
    d.refLow !== null || d.refHigh !== null || d.refText
      ? [
          {
            ...(d.refLow !== null ? { low: quantity(d.refLow, d.unit) } : {}),
            ...(d.refHigh !== null ? { high: quantity(d.refHigh, d.unit) } : {}),
            ...(d.refText ? { text: d.refText } : {}),
          },
        ]
      : undefined;

  return {
    resourceType: 'Observation',
    id: d.id,
    meta: { lastUpdated: d.createdAt.toISOString() },
    // Mirrors the report: a value on an unfinalised report is preliminary and
    // must not be read as a signed-off result.
    status: report.reportedAt ? 'final' : 'preliminary',
    category: [
      { coding: [{ system: OBS_CATEGORY, code: 'laboratory', display: 'Laboratory' }] },
    ],
    code: { text: d.name },
    subject: ref('Patient', report.patientId),
    effectiveDateTime: (report.reportedAt ?? d.createdAt).toISOString(),
    ...(d.valueNumber !== null
      ? { valueQuantity: quantity(d.valueNumber, d.unit) }
      : d.valueText
        ? { valueString: d.valueText }
        : {}),
    ...(interpretationOf(d.flag) ? { interpretation: interpretationOf(d.flag) } : {}),
    ...(range ? { referenceRange: range } : {}),
  };
}

// --- DiagnosticReport ------------------------------------------------------

export function toFhirDiagnosticReport(r: {
  id: string;
  patientId: string;
  /** The name lives on the order this report answers, not on the report. */
  serviceOrder: { serviceName: string };
  department: string;
  findings: string | null;
  impression: string | null;
  reportedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  values: { id: string }[];
}): FhirDiagnosticReport {
  const conclusion = [r.impression, r.findings].filter(Boolean).join('\n\n');
  return {
    resourceType: 'DiagnosticReport',
    id: r.id,
    meta: { lastUpdated: r.updatedAt.toISOString() },
    // `final` only once it has been handed over. Anything with values but no
    // sign-off is `preliminary`; nothing at all is `registered`.
    status: r.reportedAt ? 'final' : r.values.length > 0 ? 'preliminary' : 'registered',
    category: [{ text: r.department }],
    code: { text: r.serviceOrder.serviceName },
    subject: ref('Patient', r.patientId),
    effectiveDateTime: r.createdAt.toISOString(),
    ...(r.reportedAt ? { issued: r.reportedAt.toISOString() } : {}),
    ...(r.values.length > 0
      ? { result: r.values.map((v) => ref('Observation', v.id)) }
      : {}),
    ...(conclusion ? { conclusion } : {}),
  };
}

// --- Condition -------------------------------------------------------------

export function toFhirCondition(d: {
  id: string;
  opdVisitId: string;
  isPrimary: boolean;
  note: string | null;
  createdAt: Date;
  icd10Code: { code: string; title: string };
  opdVisit: { patientId: string };
}): FhirCondition {
  return {
    resourceType: 'Condition',
    id: d.id,
    meta: { lastUpdated: d.createdAt.toISOString() },
    clinicalStatus: {
      coding: [{ system: CONDITION_CLINICAL, code: 'active', display: 'Active' }],
    },
    // A doctor recorded it against a visit, so it is a confirmed diagnosis
    // rather than a differential.
    verificationStatus: {
      coding: [{ system: CONDITION_VER, code: 'confirmed', display: 'Confirmed' }],
    },
    category: [{ text: d.isPrimary ? 'Primary diagnosis' : 'Secondary diagnosis' }],
    code: {
      coding: [{ system: ICD10, code: d.icd10Code.code, display: d.icd10Code.title }],
      text: d.icd10Code.title,
    },
    subject: ref('Patient', d.opdVisit.patientId),
    encounter: ref('Encounter', d.opdVisitId),
    recordedDate: d.createdAt.toISOString(),
    ...(d.note ? { note: [{ text: d.note }] } : {}),
  };
}

// --- MedicationRequest -----------------------------------------------------

export function toFhirMedicationRequest(p: {
  id: string;
  opdVisitId: string;
  drugName: string;
  dose: string | null;
  frequency: string | null;
  durationDays: number | null;
  instructions: string | null;
  createdAt: Date;
  opdVisit: { patientId: string; practitionerId: string | null };
}): FhirMedicationRequest {
  const text = [p.dose, p.frequency, p.durationDays ? `for ${p.durationDays} days` : null, p.instructions]
    .filter(Boolean)
    .join(' · ');

  return {
    resourceType: 'MedicationRequest',
    id: p.id,
    meta: { lastUpdated: p.createdAt.toISOString() },
    status: 'active',
    intent: 'order',
    // Text only: we prescribe by name, not against a coded drug dictionary,
    // and a fabricated code is worse than an honest name.
    medicationCodeableConcept: { text: p.drugName },
    subject: ref('Patient', p.opdVisit.patientId),
    encounter: ref('Encounter', p.opdVisitId),
    authoredOn: p.createdAt.toISOString(),
    ...(p.opdVisit.practitionerId
      ? { requester: ref('Practitioner', p.opdVisit.practitionerId) }
      : {}),
    ...(text
      ? {
          dosageInstruction: [
            {
              text,
              ...(p.durationDays
                ? {
                    timing: {
                      repeat: {
                        boundsDuration: {
                          value: p.durationDays,
                          unit: 'd',
                          system: UCUM,
                          code: 'd',
                        },
                      },
                    },
                  }
                : {}),
            },
          ],
        }
      : {}),
  };
}
