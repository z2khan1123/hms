import { describe, expect, it } from 'vitest';
import {
  admissionToEncounter,
  diagnosticValueToObservation,
  opdVisitToEncounter,
  toFhirCondition,
  toFhirDiagnosticReport,
  toFhirMedicationRequest,
  toFhirPatient,
  vitalToObservation,
} from './fhir.mapper.js';

const BASE = 'https://hms.test/api';
const TENANT = 'tenant-1';
const D = (s: string) => new Date(s);

const patient = {
  id: 'p1',
  mrn: 'DMO-000001',
  firstName: 'Fatima',
  lastName: 'Riaz',
  gender: 'female' as const,
  birthDate: D('1990-04-12T00:00:00Z'),
  phone: '+923001234567',
  alternatePhone: null,
  email: null,
  address: { line1: '12 Mall Road', city: 'Lahore', country: 'PK' },
  maritalStatus: 'married',
  status: 'active',
  updatedAt: D('2026-09-08T10:00:00Z'),
  deathRecord: null,
};

describe('Patient', () => {
  it('carries the MRN as an official identifier with a namespaced system', () => {
    const r = toFhirPatient(patient, BASE, TENANT);
    expect(r.resourceType).toBe('Patient');
    expect(r.identifier[0].value).toBe('DMO-000001');
    expect(r.identifier[0].system).toBe(`${BASE}/fhir/identifier/mrn`);
    expect(r.identifier[0].type?.coding?.[0].code).toBe('MR');
  });

  it('splits the name into family and given, as FHIR expects', () => {
    const r = toFhirPatient(patient, BASE, TENANT);
    expect(r.name[0].family).toBe('Riaz');
    expect(r.name[0].given).toEqual(['Fatima']);
  });

  it('emits birthDate as a date, never a timestamp', () => {
    expect(toFhirPatient(patient, BASE, TENANT).birthDate).toBe('1990-04-12');
  });

  it('says nothing about death for a living patient', () => {
    // Asserting `deceasedBoolean: false` would claim we had established it.
    const r = toFhirPatient(patient, BASE, TENANT);
    expect(r).not.toHaveProperty('deceasedBoolean');
    expect(r).not.toHaveProperty('deceasedDateTime');
  });

  it('gives the exact time of death when the register has it', () => {
    const r = toFhirPatient(
      { ...patient, status: 'deceased', deathRecord: { diedAt: D('2026-09-01T04:30:00Z') } },
      BASE,
      TENANT,
    );
    expect(r.deceasedDateTime).toBe('2026-09-01T04:30:00.000Z');
    expect(r).not.toHaveProperty('deceasedBoolean');
  });

  it('falls back to a bare boolean when the status says deceased but no record exists', () => {
    const r = toFhirPatient({ ...patient, status: 'deceased' }, BASE, TENANT);
    expect(r.deceasedBoolean).toBe(true);
  });

  it('keeps `active` about the record, not about being alive', () => {
    const dead = toFhirPatient({ ...patient, status: 'deceased' }, BASE, TENANT);
    expect(dead.active).toBe(true);
    const inactive = toFhirPatient({ ...patient, status: 'inactive' }, BASE, TENANT);
    expect(inactive.active).toBe(false);
  });

  it('omits the address entirely rather than emitting an empty one', () => {
    const r = toFhirPatient({ ...patient, address: null }, BASE, TENANT);
    expect(r).not.toHaveProperty('address');
  });
});

describe('Encounter', () => {
  const visit = {
    id: 'v1',
    opdNo: 'OPD-000001',
    patientId: 'p1',
    practitionerId: 'pr1',
    status: 'completed',
    visitAt: D('2026-09-08T09:00:00Z'),
    updatedAt: D('2026-09-08T09:45:00Z'),
  };

  it('uses AMB for an outpatient visit and IMP for an admission', () => {
    expect(opdVisitToEncounter(visit, BASE).class.code).toBe('AMB');
    expect(
      admissionToEncounter(
        {
          id: 'a1',
          admissionNo: 'IPD-000001',
          patientId: 'p1',
          admittedById: null,
          status: 'admitted',
          admittedAt: D('2026-09-01T00:00:00Z'),
          dischargedAt: null,
          updatedAt: D('2026-09-01T00:00:00Z'),
        },
        BASE,
      ).class.code,
    ).toBe('IMP');
  });

  it('maps our statuses onto FHIR lifecycle codes', () => {
    const cases = [
      ['registered', 'planned'],
      ['waiting', 'arrived'],
      ['in_consultation', 'in-progress'],
      ['completed', 'finished'],
      ['cancelled', 'cancelled'],
    ] as const;
    for (const [ours, theirs] of cases) {
      expect(opdVisitToEncounter({ ...visit, status: ours }, BASE).status, ours).toBe(theirs);
    }
  });

  it('leaves an open encounter with no end — inventing one reports a patient as gone', () => {
    const open = opdVisitToEncounter({ ...visit, status: 'in_consultation' }, BASE);
    expect(open.period.start).toBe('2026-09-08T09:00:00.000Z');
    expect(open.period.end).toBeUndefined();
  });

  it('closes a finished encounter', () => {
    expect(opdVisitToEncounter(visit, BASE).period.end).toBe('2026-09-08T09:45:00.000Z');
  });

  it('references the patient by relative reference, as FHIR requires', () => {
    expect(opdVisitToEncounter(visit, BASE).subject.reference).toBe('Patient/p1');
  });
});

describe('Observation', () => {
  const vital = {
    id: 'o1',
    patientId: 'p1',
    opdVisitId: 'v1',
    admissionId: null,
    value: 138,
    flag: 'high' as const,
    recordedAt: D('2026-09-08T09:10:00Z'),
    vitalType: { name: 'Systolic BP', unit: 'mmHg', refLow: 90, refHigh: 120 },
  };

  it('categorises a vital as vital-signs', () => {
    expect(vitalToObservation(vital).category[0].coding?.[0].code).toBe('vital-signs');
  });

  it('emits the value as a UCUM quantity', () => {
    const r = vitalToObservation(vital);
    expect(r.valueQuantity).toEqual({
      value: 138,
      unit: 'mmHg',
      system: 'http://unitsofmeasure.org',
      code: 'mmHg',
    });
  });

  it('translates our flag into a FHIR interpretation code', () => {
    expect(vitalToObservation(vital).interpretation?.[0].coding?.[0].code).toBe('H');
    expect(
      vitalToObservation({ ...vital, flag: 'low' }).interpretation?.[0].coding?.[0].code,
    ).toBe('L');
    expect(vitalToObservation({ ...vital, flag: null }).interpretation).toBeUndefined();
  });

  it('carries the reference range', () => {
    const r = vitalToObservation(vital);
    expect(r.referenceRange?.[0].low?.value).toBe(90);
    expect(r.referenceRange?.[0].high?.value).toBe(120);
  });

  it('marks a lab value preliminary until its report is signed off', () => {
    const value = {
      id: 'd1',
      name: 'Haemoglobin',
      unit: 'g/dL',
      valueText: null,
      valueNumber: 11.2,
      flag: 'low' as const,
      refLow: 12,
      refHigh: 16,
      refText: null,
      createdAt: D('2026-09-08T11:00:00Z'),
    };
    const draft = diagnosticValueToObservation(value, {
      patientId: 'p1',
      reportedAt: null,
      serviceOrderId: 'so1',
    });
    expect(draft.status).toBe('preliminary');

    const final = diagnosticValueToObservation(value, {
      patientId: 'p1',
      reportedAt: D('2026-09-08T12:00:00Z'),
      serviceOrderId: 'so1',
    });
    expect(final.status).toBe('final');
    expect(final.category[0].coding?.[0].code).toBe('laboratory');
  });

  it('uses valueString for a non-numeric result', () => {
    const r = diagnosticValueToObservation(
      {
        id: 'd2',
        name: 'Appearance',
        unit: null,
        valueText: 'Straw coloured',
        valueNumber: null,
        flag: null,
        refLow: null,
        refHigh: null,
        refText: 'Straw coloured',
        createdAt: D('2026-09-08T11:00:00Z'),
      },
      { patientId: 'p1', reportedAt: null, serviceOrderId: 'so1' },
    );
    expect(r.valueString).toBe('Straw coloured');
    expect(r.valueQuantity).toBeUndefined();
  });
});

describe('DiagnosticReport', () => {
  const base = {
    id: 'r1',
    patientId: 'p1',
    serviceOrder: { serviceName: 'Complete Blood Count' },
    department: 'laboratory',
    findings: 'Mild anaemia',
    impression: 'Anaemia',
    createdAt: D('2026-09-08T10:00:00Z'),
    updatedAt: D('2026-09-08T12:00:00Z'),
  };

  it('is registered with nothing on it, preliminary with values, final once issued', () => {
    expect(toFhirDiagnosticReport({ ...base, reportedAt: null, values: [] }).status).toBe(
      'registered',
    );
    expect(
      toFhirDiagnosticReport({ ...base, reportedAt: null, values: [{ id: 'd1' }] }).status,
    ).toBe('preliminary');
    expect(
      toFhirDiagnosticReport({
        ...base,
        reportedAt: D('2026-09-08T12:00:00Z'),
        values: [{ id: 'd1' }],
      }).status,
    ).toBe('final');
  });

  it('sets `issued` only once it has actually been issued', () => {
    expect(
      toFhirDiagnosticReport({ ...base, reportedAt: null, values: [] }).issued,
    ).toBeUndefined();
  });

  it('links its observations', () => {
    const r = toFhirDiagnosticReport({
      ...base,
      reportedAt: D('2026-09-08T12:00:00Z'),
      values: [{ id: 'd1' }, { id: 'd2' }],
    });
    expect(r.result?.map((x) => x.reference)).toEqual([
      'Observation/d1',
      'Observation/d2',
    ]);
  });
});

describe('Condition', () => {
  it('codes the diagnosis against ICD-10', () => {
    const r = toFhirCondition({
      id: 'c1',
      opdVisitId: 'v1',
      isPrimary: true,
      note: null,
      createdAt: D('2026-09-08T09:30:00Z'),
      icd10Code: { code: 'J06.9', title: 'Acute upper respiratory infection' },
      opdVisit: { patientId: 'p1' },
    });
    expect(r.code.coding?.[0].system).toBe('http://hl7.org/fhir/sid/icd-10');
    expect(r.code.coding?.[0].code).toBe('J06.9');
    expect(r.subject.reference).toBe('Patient/p1');
    expect(r.encounter?.reference).toBe('Encounter/v1');
  });
});

describe('MedicationRequest', () => {
  it('states the drug as text rather than inventing a code', () => {
    const r = toFhirMedicationRequest({
      id: 'm1',
      opdVisitId: 'v1',
      drugName: 'Amoxicillin 500mg',
      dose: '1 capsule',
      frequency: 'three times a day',
      durationDays: 5,
      instructions: 'after food',
      createdAt: D('2026-09-08T09:35:00Z'),
      opdVisit: { patientId: 'p1', practitionerId: 'pr1' },
    });
    expect(r.medicationCodeableConcept.text).toBe('Amoxicillin 500mg');
    expect(r.medicationCodeableConcept.coding).toBeUndefined();
    expect(r.intent).toBe('order');
    expect(r.requester?.reference).toBe('Practitioner/pr1');
  });

  it('builds a readable dosage line and a bounded duration', () => {
    const r = toFhirMedicationRequest({
      id: 'm1',
      opdVisitId: 'v1',
      drugName: 'Amoxicillin',
      dose: '1 capsule',
      frequency: 'TDS',
      durationDays: 5,
      instructions: null,
      createdAt: D('2026-09-08T09:35:00Z'),
      opdVisit: { patientId: 'p1', practitionerId: null },
    });
    expect(r.dosageInstruction?.[0].text).toBe('1 capsule · TDS · for 5 days');
    expect(r.dosageInstruction?.[0].timing?.repeat?.boundsDuration).toEqual({
      value: 5,
      unit: 'd',
      system: 'http://unitsofmeasure.org',
      code: 'd',
    });
  });

  it('omits the requester when nobody is recorded', () => {
    const r = toFhirMedicationRequest({
      id: 'm1',
      opdVisitId: 'v1',
      drugName: 'Paracetamol',
      dose: null,
      frequency: null,
      durationDays: null,
      instructions: null,
      createdAt: D('2026-09-08T09:35:00Z'),
      opdVisit: { patientId: 'p1', practitionerId: null },
    });
    expect(r).not.toHaveProperty('requester');
    expect(r).not.toHaveProperty('dosageInstruction');
  });
});
