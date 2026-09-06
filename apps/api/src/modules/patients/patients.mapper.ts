import type { Prisma } from '@prisma/client';
import type {
  Address,
  Patient as PatientDto,
  PatientSummary,
} from '@hms/shared';
import { toIsoDate, toIsoDateOrNull } from '../../common/util/dates.js';

/** Everything `patientSchema` needs beyond the patient's own columns. */
export const patientDetailInclude = {
  tpa: { select: { id: true, name: true, code: true } },
} as const;

export type PatientDetailRow = Prisma.PatientGetPayload<{
  include: typeof patientDetailInclude;
}>;

export function toPatientDto(p: PatientDetailRow): PatientDto {
  return {
    id: p.id,
    mrn: p.mrn,
    firstName: p.firstName,
    lastName: p.lastName,
    guardianName: p.guardianName,
    gender: p.gender,
    birthDate: toIsoDate(p.birthDate),
    maritalStatus: p.maritalStatus,
    bloodType: p.bloodType,

    phone: p.phone,
    alternatePhone: p.alternatePhone,
    email: p.email,
    address: (p.address as Address | null) ?? null,

    nationalIdLast4: p.nationalIdLast4,

    photoUrl: p.photoUrl,
    knownAllergies: p.knownAllergies,
    remarks: p.remarks,

    tpa: p.tpa ? { id: p.tpa.id, name: p.tpa.name, code: p.tpa.code } : null,
    tpaMemberId: p.tpaMemberId,
    tpaValidTill: toIsoDateOrNull(p.tpaValidTill),

    status: p.status,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

/** The compact patient shape embedded in cases, visits and pickers. */
export const patientSummarySelect = {
  id: true,
  mrn: true,
  firstName: true,
  lastName: true,
  gender: true,
  birthDate: true,
  phone: true,
  knownAllergies: true,
} as const;

export type PatientSummaryRow = Prisma.PatientGetPayload<{
  select: typeof patientSummarySelect;
}>;

export function toPatientSummary(p: PatientSummaryRow): PatientSummary {
  return {
    id: p.id,
    mrn: p.mrn,
    firstName: p.firstName,
    lastName: p.lastName,
    gender: p.gender,
    birthDate: toIsoDate(p.birthDate),
    phone: p.phone,
    knownAllergies: p.knownAllergies,
  };
}
