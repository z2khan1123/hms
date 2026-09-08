import type { BloodGroup as PrismaBloodGroup, Prisma } from '@prisma/client';
import {
  type BloodGroup,
  type BloodIssue as BloodIssueDto,
  type BloodUnit as BloodUnitDto,
  type Donor as DonorDto,
  bloodUnitStatusOf,
  eligibleFrom,
  isDonorDeferred,
} from '@hms/shared';
import { toIsoDate, toIsoDateOrNull, toIsoDateTimeOrNull } from '../../common/util/dates.js';
import { toPatientSummary } from '../patients/patients.mapper.js';

/**
 * Prisma cannot name an enum member `A+`, so the members are `A_POS` and are
 * `@map`ped to `A+` in the database. `@map` changes only what Postgres stores —
 * the generated client still speaks member names — so this is a real
 * translation, not a cast. A cast compiles and then fails at the database,
 * which is exactly what it did the first time.
 */
const TO_PRISMA: Record<BloodGroup, PrismaBloodGroup> = {
  'A+': 'A_POS',
  'A-': 'A_NEG',
  'B+': 'B_POS',
  'B-': 'B_NEG',
  'AB+': 'AB_POS',
  'AB-': 'AB_NEG',
  'O+': 'O_POS',
  'O-': 'O_NEG',
};

const FROM_PRISMA: Record<PrismaBloodGroup, BloodGroup> = {
  A_POS: 'A+',
  A_NEG: 'A-',
  B_POS: 'B+',
  B_NEG: 'B-',
  AB_POS: 'AB+',
  AB_NEG: 'AB-',
  O_POS: 'O+',
  O_NEG: 'O-',
};

export function toBloodGroup(v: PrismaBloodGroup): BloodGroup {
  return FROM_PRISMA[v];
}

export function fromBloodGroup(v: BloodGroup): PrismaBloodGroup {
  return TO_PRISMA[v];
}

export const donorInclude = {
  units: {
    where: { discardedAt: null },
    select: { collectedOn: true },
    orderBy: { collectedOn: 'desc' as const },
  },
} as const;

export type DonorRow = Prisma.DonorGetPayload<{ include: typeof donorInclude }>;

/**
 * The donation history is read from the units themselves — there is no
 * `lastDonatedOn` column to fall out of step with the bags on the shelf.
 */
export function toDonorDto(r: DonorRow, today: string): DonorDto {
  const lastDonatedOn = r.units[0] ? toIsoDate(r.units[0].collectedOn) : null;
  return {
    id: r.id,
    donorNo: r.donorNo,
    firstName: r.firstName,
    lastName: r.lastName,
    bloodGroup: toBloodGroup(r.bloodGroup),
    phone: r.phone,
    birthDate: toIsoDateOrNull(r.birthDate),
    address: r.address,
    note: r.note,
    isActive: r.isActive,
    lastDonatedOn,
    donationCount: r.units.length,
    isDeferred: isDonorDeferred(lastDonatedOn, today),
    eligibleFrom: eligibleFrom(lastDonatedOn),
  };
}

export const bloodUnitInclude = {
  donor: { select: { id: true, donorNo: true, firstName: true, lastName: true } },
  issue: { include: { patient: true } },
} as const;

export type BloodUnitRow = Prisma.BloodUnitGetPayload<{
  include: typeof bloodUnitInclude;
}>;

export function toBloodUnitDto(r: BloodUnitRow, today: string): BloodUnitDto {
  return {
    id: r.id,
    bagNo: r.bagNo,
    bloodGroup: toBloodGroup(r.bloodGroup),
    component: r.component,
    volumeMl: r.volumeMl,
    collectedOn: toIsoDate(r.collectedOn),
    expiresOn: toIsoDate(r.expiresOn),
    screenedAt: toIsoDateTimeOrNull(r.screenedAt),
    screeningPassed: r.screeningPassed,
    status: bloodUnitStatusOf(
      {
        issuedAt: toIsoDateTimeOrNull(r.issuedAt),
        discardedAt: toIsoDateTimeOrNull(r.discardedAt),
        expiresOn: toIsoDate(r.expiresOn),
      },
      today,
    ),
    donor: r.donor
      ? {
          id: r.donor.id,
          donorNo: r.donor.donorNo,
          name: `${r.donor.firstName} ${r.donor.lastName}`.trim(),
        }
      : null,
    issuedAt: toIsoDateTimeOrNull(r.issuedAt),
    issuedToPatient: r.issue?.patient ? toPatientSummary(r.issue.patient) : null,
    discardedAt: toIsoDateTimeOrNull(r.discardedAt),
    discardReason: r.discardReason,
    note: r.note,
  };
}

export const bloodIssueInclude = {
  unit: { include: bloodUnitInclude },
  patient: true,
  case: { select: { caseNo: true } },
} as const;

export type BloodIssueRow = Prisma.BloodIssueGetPayload<{
  include: typeof bloodIssueInclude;
}>;

export function toBloodIssueDto(
  r: BloodIssueRow,
  today: string,
  issuedByName: string | null,
): BloodIssueDto {
  return {
    id: r.id,
    unit: toBloodUnitDto(r.unit, today),
    patient: toPatientSummary(r.patient),
    caseId: r.caseId,
    caseNo: r.case.caseNo,
    recipientGroup: toBloodGroup(r.recipientGroup),
    issuedAt: r.issuedAt.toISOString(),
    issuedBy: issuedByName,
    crossMatchedBy: r.crossMatchedBy,
    billItemId: r.billItemId,
    note: r.note,
  };
}
