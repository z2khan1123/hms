import type { Prisma } from '@prisma/client';
import {
  type Case as CaseDto,
  type CaseBalanceDto,
  computeCaseBalance,
} from '@hms/shared';
import { toIsoDateTimeOrNull } from '../../common/util/dates.js';
import {
  patientSummarySelect,
  toPatientSummary,
} from '../patients/patients.mapper.js';

/**
 * `caseSchema` reports a live balance, so the case always travels with its
 * bill lines and payments. Only the two columns the arithmetic needs are
 * selected — the full ledger is a billing concern.
 */
export const caseDetailInclude = {
  patient: { select: patientSummarySelect },
  billItems: { select: { netMinor: true } },
  payments: { select: { amountMinor: true, reversedAt: true } },
  _count: { select: { opdVisits: true } },
} as const;

export type CaseDetailRow = Prisma.CaseGetPayload<{
  include: typeof caseDetailInclude;
}>;

/** Never sum money by hand — `computeCaseBalance` is shared with the web client. */
export function balanceOf(row: {
  billItems: { netMinor: number }[];
  payments: { amountMinor: number; reversedAt: Date | null }[];
}): CaseBalanceDto {
  return computeCaseBalance(
    row.billItems,
    row.payments.map((p) => ({
      amountMinor: p.amountMinor,
      reversedAt: toIsoDateTimeOrNull(p.reversedAt),
    })),
  );
}

export function toCaseDto(c: CaseDetailRow): CaseDto {
  return {
    id: c.id,
    caseNo: c.caseNo,
    status: c.status,
    openedAt: c.openedAt.toISOString(),
    closedAt: toIsoDateTimeOrNull(c.closedAt),
    isCasualty: c.isCasualty,
    reference: c.reference,
    patient: toPatientSummary(c.patient),
    visitCount: c._count.opdVisits,
    balance: balanceOf(c),
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
  };
}
