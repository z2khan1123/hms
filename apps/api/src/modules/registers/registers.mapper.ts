import type { Prisma } from '@prisma/client';
import type {
  BirthRecord as BirthRecordDto,
  DeathRecord as DeathRecordDto,
} from '@hms/shared';
import { toIsoDateOrNull } from '../../common/util/dates.js';
import { toPatientSummary, patientSummarySelect } from '../patients/patients.mapper.js';

const practitionerName = (
  p: { firstName: string; lastName: string } | null,
): string | null => (p ? `${p.firstName} ${p.lastName}`.trim() : null);

export const birthInclude = {
  motherPatient: { select: patientSummarySelect },
  attendedBy: { select: { firstName: true, lastName: true } },
} as const;

export type BirthRow = Prisma.BirthRecordGetPayload<{
  include: typeof birthInclude;
}>;

export function toBirthRecordDto(
  r: BirthRow,
  recordedBy: string | null,
): BirthRecordDto {
  return {
    id: r.id,
    certificateNo: r.certificateNo,
    childName: r.childName,
    gender: r.gender,
    bornAt: r.bornAt.toISOString(),
    birthWeightGrams: r.birthWeightGrams,
    deliveryType: r.deliveryType,
    mother: r.motherPatient ? toPatientSummary(r.motherPatient) : null,
    motherName: r.motherName,
    motherCnicLast4: r.motherCnicLast4,
    fatherName: r.fatherName,
    fatherCnicLast4: r.fatherCnicLast4,
    contactPhone: r.contactPhone,
    address: r.address,
    attendedBy: practitionerName(r.attendedBy),
    childPatientId: r.childPatientId,
    note: r.note,
    registrationNo: r.registrationNo,
    registeredOn: toIsoDateOrNull(r.registeredOn),
    // Derived: a record is registered once the state number is on it. There is
    // no separate flag to fall out of step with the number itself.
    isRegistered: !!r.registrationNo,
    recordedBy,
    createdAt: r.createdAt.toISOString(),
  };
}

export const deathInclude = {
  patient: { select: patientSummarySelect },
  certifiedBy: { select: { firstName: true, lastName: true } },
} as const;

export type DeathRow = Prisma.DeathRecordGetPayload<{
  include: typeof deathInclude;
}>;

export function toDeathRecordDto(
  r: DeathRow,
  recordedBy: string | null,
): DeathRecordDto {
  return {
    id: r.id,
    certificateNo: r.certificateNo,
    patient: toPatientSummary(r.patient),
    diedAt: r.diedAt.toISOString(),
    causeOfDeath: r.causeOfDeath,
    placeOfDeath: r.placeOfDeath,
    certifiedBy: practitionerName(r.certifiedBy),
    informantName: r.informantName,
    informantPhone: r.informantPhone,
    informantRelation: r.informantRelation,
    note: r.note,
    registrationNo: r.registrationNo,
    registeredOn: toIsoDateOrNull(r.registeredOn),
    isRegistered: !!r.registrationNo,
    recordedBy,
    createdAt: r.createdAt.toISOString(),
  };
}
