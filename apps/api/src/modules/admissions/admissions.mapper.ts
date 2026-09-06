import type { Prisma } from '@prisma/client';
import {
  type Admission as AdmissionDto,
  type AdmissionListItem,
  type BedAssignmentRecord,
  nightsBetween,
} from '@hms/shared';
import { balanceOf } from '../cases/cases.mapper.js';
import {
  patientSummarySelect,
  toPatientSummary,
} from '../patients/patients.mapper.js';
import { toPractitionerDto } from '../practitioners/practitioners.mapper.js';

/** Where a bed assignment physically sits — bed, its type, ward and floor. */
const assignmentPlacementInclude = {
  bed: { include: { bedType: true, ward: { include: { floor: true } } } },
} as const;

type AssignmentRow = Prisma.BedAssignmentGetPayload<{
  include: typeof assignmentPlacementInclude;
}>;

const caseMoneySelect = {
  id: true,
  caseNo: true,
  billItems: { select: { netMinor: true } },
  payments: { select: { amountMinor: true, reversedAt: true } },
} as const;

export const admissionListInclude = {
  patient: { select: patientSummarySelect },
  practitioner: true,
  case: { select: caseMoneySelect },
  bedAssignments: {
    where: { toAt: null },
    include: assignmentPlacementInclude,
  },
} as const;

export const admissionDetailInclude = {
  patient: { select: patientSummarySelect },
  practitioner: true,
  case: { select: caseMoneySelect },
  bedAssignments: {
    include: assignmentPlacementInclude,
    orderBy: { fromAt: 'asc' },
  },
} as const;

export type AdmissionListRow = Prisma.AdmissionGetPayload<{
  include: typeof admissionListInclude;
}>;
export type AdmissionDetailRow = Prisma.AdmissionGetPayload<{
  include: typeof admissionDetailInclude;
}>;

function toBedPlacement(a: AssignmentRow) {
  return {
    bedId: a.bed.id,
    bedName: a.bed.name,
    wardName: a.bed.ward.name,
    floorName: a.bed.ward.floor.name,
    bedType: {
      id: a.bed.bedType.id,
      name: a.bed.bedType.name,
      defaultNightlyRateMinor: a.bed.bedType.defaultNightlyRateMinor,
      isActive: a.bed.bedType.isActive,
    },
  };
}

function toBedAssignmentRecord(a: AssignmentRow): BedAssignmentRecord {
  return {
    ...toBedPlacement(a),
    id: a.id,
    fromAt: a.fromAt.toISOString(),
    toAt: a.toAt ? a.toAt.toISOString() : null,
    moveReason: a.moveReason,
  };
}

export function toAdmissionListItem(a: AdmissionListRow): AdmissionListItem {
  const open = a.bedAssignments.find((x) => x.toAt === null) ?? null;
  return {
    id: a.id,
    admissionNo: a.admissionNo,
    status: a.status,
    admittedAt: a.admittedAt.toISOString(),
    dischargedAt: a.dischargedAt ? a.dischargedAt.toISOString() : null,
    patient: toPatientSummary(a.patient),
    practitioner: toPractitionerDto(a.practitioner),
    caseId: a.case.id,
    caseNo: a.case.caseNo,
    currentBed: open ? toBedPlacement(open) : null,
    // Whole nights so far — never reimplemented, always the shared helper.
    nights: nightsBetween(a.admittedAt, a.dischargedAt ?? new Date()),
    balanceMinor: balanceOf(a.case).balanceMinor,
  };
}

export function toAdmissionDto(a: AdmissionDetailRow): AdmissionDto {
  return {
    ...toAdmissionListItem(a),
    provisionalDiagnosis: a.provisionalDiagnosis,
    admissionNote: a.admissionNote,
    dischargeSummary: a.dischargeSummary,
    dischargeAdvice: a.dischargeAdvice,
    revertedAt: a.revertedAt ? a.revertedAt.toISOString() : null,
    revertReason: a.revertReason,
    fromOpdVisitId: a.fromOpdVisitId,
    bedHistory: a.bedAssignments.map(toBedAssignmentRecord),
    caseBalance: balanceOf(a.case),
    createdAt: a.createdAt.toISOString(),
    updatedAt: a.updatedAt.toISOString(),
  };
}
