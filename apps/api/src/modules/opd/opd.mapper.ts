import type { Prisma } from '@prisma/client';
import type {
  OpdVisit as OpdVisitDto,
  OpdVisitListItem,
} from '@hms/shared';
import { balanceOf } from '../cases/cases.mapper.js';
import {
  patientSummarySelect,
  toPatientSummary,
} from '../patients/patients.mapper.js';
import { toPractitionerDto } from '../practitioners/practitioners.mapper.js';

/**
 * The queue row carries the case's money, not the visit's: billing rolls up per
 * case, so `netChargedMinor / paidMinor / balanceMinor` sit alongside
 * `caseId / caseNo` and always satisfy net - paid = balance.
 */
const caseMoneySelect = {
  id: true,
  caseNo: true,
  chargeItems: { select: { netMinor: true } },
  payments: { select: { amountMinor: true, reversedAt: true } },
} as const;

export const opdVisitListInclude = {
  patient: { select: patientSummarySelect },
  practitioner: true,
  case: { select: caseMoneySelect },
} as const;

export const opdVisitDetailInclude = {
  patient: { select: patientSummarySelect },
  practitioner: true,
  case: { select: caseMoneySelect },
  symptoms: { orderBy: { createdAt: 'asc' } },
  findings: { orderBy: { createdAt: 'asc' } },
  diagnoses: {
    include: { icd10Code: { include: { group: true } } },
    orderBy: { createdAt: 'asc' },
  },
} as const;

export type OpdVisitListRow = Prisma.OpdVisitGetPayload<{
  include: typeof opdVisitListInclude;
}>;

export type OpdVisitDetailRow = Prisma.OpdVisitGetPayload<{
  include: typeof opdVisitDetailInclude;
}>;

export function toOpdVisitListItem(v: OpdVisitListRow): OpdVisitListItem {
  const balance = balanceOf(v.case);
  return {
    id: v.id,
    opdNo: v.opdNo,
    visitAt: v.visitAt.toISOString(),
    status: v.status,
    isFollowUp: v.isFollowUp,
    isAntenatal: v.isAntenatal,
    patient: toPatientSummary(v.patient),
    practitioner: toPractitionerDto(v.practitioner),
    caseId: v.caseId,
    caseNo: v.case.caseNo,
    netChargedMinor: balance.chargedMinor,
    paidMinor: balance.paidMinor,
    balanceMinor: balance.balanceMinor,
  };
}

export function toOpdVisitDto(v: OpdVisitDetailRow): OpdVisitDto {
  return {
    ...toOpdVisitListItem(v),
    isLiveConsult: v.isLiveConsult,
    reference: v.reference,
    note: v.note,
    previousMedicalIssue: v.previousMedicalIssue,
    knownAllergies: v.knownAllergies,
    symptoms: v.symptoms.map((s) => ({
      id: s.id,
      symptomId: s.symptomId,
      title: s.title,
      detail: s.detail,
    })),
    findings: v.findings.map((f) => ({
      id: f.id,
      findingId: f.findingId,
      title: f.title,
      detail: f.detail,
    })),
    diagnoses: v.diagnoses.map((d) => ({
      id: d.id,
      isPrimary: d.isPrimary,
      note: d.note,
      icd10Code: {
        id: d.icd10Code.id,
        code: d.icd10Code.code,
        title: d.icd10Code.title,
        group: { id: d.icd10Code.group.id, name: d.icd10Code.group.name },
      },
    })),
    caseBalance: balanceOf(v.case),
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
  };
}
