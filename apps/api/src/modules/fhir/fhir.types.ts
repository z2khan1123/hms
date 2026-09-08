/**
 * The slice of FHIR R4 this façade actually emits.
 *
 * Written out rather than pulled from a package on purpose. A full FHIR type
 * library is thousands of optional fields, and having them available makes it
 * far too easy to half-populate a resource — which is worse than not offering
 * it, because a consumer cannot tell the difference between "absent" and
 * "we did not bother". Everything here is something we genuinely have.
 */

export interface Coding {
  system?: string;
  code?: string;
  display?: string;
}

export interface CodeableConcept {
  coding?: Coding[];
  text?: string;
}

export interface Identifier {
  use?: 'usual' | 'official' | 'temp' | 'secondary';
  system?: string;
  value: string;
  type?: CodeableConcept;
}

export interface HumanName {
  use?: 'usual' | 'official' | 'nickname' | 'anonymous' | 'old' | 'maiden';
  text?: string;
  family?: string;
  given?: string[];
}

export interface ContactPoint {
  system: 'phone' | 'email' | 'fax' | 'url' | 'sms' | 'other';
  value: string;
  use?: 'home' | 'work' | 'temp' | 'old' | 'mobile';
}

export interface Address {
  use?: 'home' | 'work' | 'temp' | 'old' | 'billing';
  line?: string[];
  city?: string;
  country?: string;
  text?: string;
}

export interface Reference {
  reference: string;
  display?: string;
}

export interface Period {
  start?: string;
  end?: string;
}

export interface Quantity {
  value?: number;
  unit?: string;
  system?: string;
  code?: string;
}

export interface Range {
  low?: Quantity;
  high?: Quantity;
}

interface ResourceBase {
  id: string;
  meta?: { lastUpdated?: string };
}

export interface FhirPatient extends ResourceBase {
  resourceType: 'Patient';
  identifier: Identifier[];
  active: boolean;
  name: HumanName[];
  telecom?: ContactPoint[];
  gender: 'male' | 'female' | 'other' | 'unknown';
  birthDate?: string;
  /** From the death register. Absent entirely for a living patient. */
  deceasedBoolean?: boolean;
  deceasedDateTime?: string;
  address?: Address[];
  maritalStatus?: CodeableConcept;
  managingOrganization?: Reference;
}

export interface FhirPractitioner extends ResourceBase {
  resourceType: 'Practitioner';
  identifier?: Identifier[];
  active: boolean;
  name: HumanName[];
  telecom?: ContactPoint[];
}

export interface FhirOrganization extends ResourceBase {
  resourceType: 'Organization';
  identifier?: Identifier[];
  active: boolean;
  name: string;
}

export interface FhirEncounter extends ResourceBase {
  resourceType: 'Encounter';
  identifier?: Identifier[];
  status:
    | 'planned'
    | 'arrived'
    | 'triaged'
    | 'in-progress'
    | 'onleave'
    | 'finished'
    | 'cancelled';
  class: Coding;
  subject: Reference;
  participant?: { individual: Reference }[];
  period: Period;
  reasonCode?: CodeableConcept[];
}

export interface FhirObservation extends ResourceBase {
  resourceType: 'Observation';
  status: 'registered' | 'preliminary' | 'final' | 'amended';
  category: CodeableConcept[];
  code: CodeableConcept;
  subject: Reference;
  encounter?: Reference;
  effectiveDateTime: string;
  valueQuantity?: Quantity;
  valueString?: string;
  interpretation?: CodeableConcept[];
  referenceRange?: { low?: Quantity; high?: Quantity; text?: string }[];
}

export interface FhirDiagnosticReport extends ResourceBase {
  resourceType: 'DiagnosticReport';
  identifier?: Identifier[];
  status: 'registered' | 'partial' | 'preliminary' | 'final';
  category?: CodeableConcept[];
  code: CodeableConcept;
  subject: Reference;
  effectiveDateTime?: string;
  issued?: string;
  result?: Reference[];
  conclusion?: string;
}

export interface FhirCondition extends ResourceBase {
  resourceType: 'Condition';
  clinicalStatus?: CodeableConcept;
  verificationStatus?: CodeableConcept;
  category?: CodeableConcept[];
  code: CodeableConcept;
  subject: Reference;
  encounter?: Reference;
  recordedDate?: string;
  note?: { text: string }[];
}

export interface FhirMedicationRequest extends ResourceBase {
  resourceType: 'MedicationRequest';
  status: 'active' | 'completed' | 'stopped' | 'cancelled';
  intent: 'order';
  medicationCodeableConcept: CodeableConcept;
  subject: Reference;
  encounter?: Reference;
  authoredOn: string;
  requester?: Reference;
  dosageInstruction?: {
    text?: string;
    timing?: { repeat?: { boundsDuration?: Quantity } };
    doseAndRate?: { doseQuantity?: Quantity }[];
  }[];
}

export type FhirResource =
  | FhirPatient
  | FhirPractitioner
  | FhirOrganization
  | FhirEncounter
  | FhirObservation
  | FhirDiagnosticReport
  | FhirCondition
  | FhirMedicationRequest;

export interface BundleEntry<T = FhirResource> {
  fullUrl: string;
  resource: T;
  search?: { mode: 'match' | 'include' };
}

export interface FhirBundle<T = FhirResource> {
  resourceType: 'Bundle';
  type: 'searchset';
  /** Total matching the search, not the number in this page. */
  total: number;
  link: { relation: 'self' | 'next' | 'previous'; url: string }[];
  entry: BundleEntry<T>[];
}

export interface OperationOutcome {
  resourceType: 'OperationOutcome';
  issue: {
    severity: 'fatal' | 'error' | 'warning' | 'information';
    code: string;
    diagnostics?: string;
  }[];
}
