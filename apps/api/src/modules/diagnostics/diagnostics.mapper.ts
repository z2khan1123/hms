import type { Prisma } from '@prisma/client';
import type {
  DiagnosticReport as DiagnosticReportDto,
  DiagnosticValue as DiagnosticValueDto,
} from '@hms/shared';
import { toIsoDateTimeOrNull } from '../../common/util/dates.js';
import {
  patientSummarySelect,
  toPatientSummary,
} from '../patients/patients.mapper.js';

/**
 * Everything `diagnosticReportSchema` needs beyond the report's own columns:
 * the patient header, the case number, the ordered service's name (the report
 * has no name of its own), the test's sample/method, and the measured values.
 */
export const diagnosticReportInclude = {
  patient: { select: patientSummarySelect },
  case: { select: { caseNo: true } },
  serviceOrder: { select: { serviceName: true } },
  labTest: { select: { sampleType: true, method: true } },
  values: { orderBy: { sortOrder: 'asc' } },
} as const satisfies Prisma.DiagnosticReportInclude;

export type DiagnosticReportRow = Prisma.DiagnosticReportGetPayload<{
  include: typeof diagnosticReportInclude;
}>;

function toValueDto(
  v: DiagnosticReportRow['values'][number],
): DiagnosticValueDto {
  return {
    id: v.id,
    parameterId: v.parameterId,
    name: v.name,
    unit: v.unit,
    valueText: v.valueText,
    valueNumber: v.valueNumber,
    flag: v.flag,
    refLow: v.refLow,
    refHigh: v.refHigh,
    refText: v.refText,
    sortOrder: v.sortOrder,
  };
}

export function toDiagnosticReportDto(
  r: DiagnosticReportRow,
  reportedByName: string | null,
): DiagnosticReportDto {
  return {
    id: r.id,
    serviceOrderId: r.serviceOrderId,
    department: r.department,
    patient: toPatientSummary(r.patient),
    caseId: r.caseId,
    caseNo: r.case.caseNo,

    serviceName: r.serviceOrder.serviceName,
    labTestId: r.labTestId,
    sampleType: r.labTest?.sampleType ?? null,
    method: r.labTest?.method ?? null,

    sampleCollectedAt: toIsoDateTimeOrNull(r.sampleCollectedAt),
    findings: r.findings,
    impression: r.impression,
    comments: r.comments,
    reportedAt: toIsoDateTimeOrNull(r.reportedAt),
    reportedBy: reportedByName,

    values: r.values.map(toValueDto),
    isFinal: r.reportedAt !== null,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}
