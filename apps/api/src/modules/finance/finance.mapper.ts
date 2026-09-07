import type { ExpenseHead, IncomeHead, Prisma } from '@prisma/client';
import type {
  LedgerEntry,
  LedgerHead,
  ReferralPayment as ReferralPaymentDto,
  Referrer as ReferrerDto,
} from '@hms/shared';
import { toIsoDateOrNull } from '../../common/util/dates.js';
import { zonedDateString } from '../../common/util/time-zone.js';

// --- heads ---------------------------------------------------------------

export function toLedgerHeadDto(h: IncomeHead | ExpenseHead): LedgerHead {
  return { id: h.id, name: h.name, isActive: h.isActive };
}

// --- entries -----------------------------------------------------------

export const incomeInclude = { head: true } as const;
export const expenseInclude = { head: true } as const;

export type IncomeRow = Prisma.IncomeGetPayload<{
  include: typeof incomeInclude;
}>;
export type ExpenseRow = Prisma.ExpenseGetPayload<{
  include: typeof expenseInclude;
}>;

export function toIncomeEntryDto(row: IncomeRow): LedgerEntry {
  return {
    id: row.id,
    head: toLedgerHeadDto(row.head),
    description: row.description,
    amountMinor: row.amountMinor,
    occurredAt: row.receivedAt.toISOString(),
    invoiceNo: row.invoiceNo,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toExpenseEntryDto(row: ExpenseRow): LedgerEntry {
  return {
    id: row.id,
    head: toLedgerHeadDto(row.head),
    description: row.description,
    amountMinor: row.amountMinor,
    occurredAt: row.paidAt.toISOString(),
    invoiceNo: row.invoiceNo,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * The books are not quietly editable: an entry may be hard-deleted only on the
 * same calendar day it was created (a same-day fat-finger fix), and after that
 * it must be reversed with a compensating entry. "Same day" is the hospital's
 * day, not UTC.
 */
export function isSameCalendarDay(
  a: Date,
  b: Date,
  timeZone: string,
): boolean {
  return zonedDateString(timeZone, a) === zonedDateString(timeZone, b);
}

// --- referrers -------------------------------------------------------

export interface ReferrerStats {
  caseCount: number;
  referredNetMinor: number;
  paidMinor: number;
}

export const EMPTY_REFERRER_STATS: ReferrerStats = {
  caseCount: 0,
  referredNetMinor: 0,
  paidMinor: 0,
};

export function toReferrerDto(
  row: {
    id: string;
    name: string;
    phone: string | null;
    category: string | null;
    commissionBps: number | null;
    isActive: boolean;
  },
  stats: ReferrerStats,
): ReferrerDto {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    category: row.category,
    commissionBps: row.commissionBps,
    isActive: row.isActive,
    caseCount: stats.caseCount,
    referredNetMinor: stats.referredNetMinor,
    paidMinor: stats.paidMinor,
  };
}

// --- referral payments --------------------------------------------

export const referralPaymentInclude = {
  referrer: { select: { name: true } },
} as const;

export type ReferralPaymentRow = Prisma.ReferralPaymentGetPayload<{
  include: typeof referralPaymentInclude;
}>;

export function toReferralPaymentDto(
  row: ReferralPaymentRow,
): ReferralPaymentDto {
  return {
    id: row.id,
    referrerId: row.referrerId,
    referrerName: row.referrer.name,
    amountMinor: row.amountMinor,
    paidAt: row.paidAt.toISOString(),
    periodFrom: toIsoDateOrNull(row.periodFrom),
    periodTo: toIsoDateOrNull(row.periodTo),
    note: row.note,
  };
}
