import { z } from 'zod';
import { isoDateSchema, isoDateTimeSchema } from './common.js';

/**
 * Money in and out that is not a patient bill — rent, salaries, utilities,
 * equipment sales, referral payouts. Patient billing lives on the Case; this is
 * everything else, so a hospital can see its whole position in one place.
 */

// --- heads -----------------------------------------------------------------

export const createLedgerHeadSchema = z.object({
  name: z.string().trim().min(1).max(120),
});
export type CreateLedgerHeadInput = z.infer<typeof createLedgerHeadSchema>;

export const ledgerHeadSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  isActive: z.boolean(),
});
export type LedgerHead = z.infer<typeof ledgerHeadSchema>;

// --- entries ---------------------------------------------------------------

const ledgerEntryBase = {
  headId: z.string().uuid(),
  description: z.string().trim().min(1).max(300),
  amountMinor: z.number().int().min(1),
  invoiceNo: z.string().trim().max(80).optional(),
  note: z.string().trim().max(500).optional(),
};

export const createIncomeSchema = z.object({
  ...ledgerEntryBase,
  receivedAt: isoDateTimeSchema.optional(),
});
export type CreateIncomeInput = z.infer<typeof createIncomeSchema>;

export const createExpenseSchema = z.object({
  ...ledgerEntryBase,
  paidAt: isoDateTimeSchema.optional(),
});
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;

export const ledgerEntrySchema = z.object({
  id: z.string().uuid(),
  head: ledgerHeadSchema,
  description: z.string(),
  amountMinor: z.number().int(),
  /** `receivedAt` for income, `paidAt` for an expense — one field to render. */
  occurredAt: isoDateTimeSchema,
  invoiceNo: z.string().nullable(),
  note: z.string().nullable(),
  createdAt: isoDateTimeSchema,
});
export type LedgerEntry = z.infer<typeof ledgerEntrySchema>;

export const ledgerListQuerySchema = z.object({
  headId: z.string().uuid().optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  q: z.string().trim().max(120).optional(),
});

/** Totals for a period, so a screen never adds money up itself. */
export const ledgerSummarySchema = z.object({
  incomeMinor: z.number().int(),
  expenseMinor: z.number().int(),
  netMinor: z.number().int(),
  byIncomeHead: z.array(
    z.object({ headId: z.string().uuid(), name: z.string(), amountMinor: z.number().int() }),
  ),
  byExpenseHead: z.array(
    z.object({ headId: z.string().uuid(), name: z.string(), amountMinor: z.number().int() }),
  ),
});
export type LedgerSummary = z.infer<typeof ledgerSummarySchema>;

// --- referrers -------------------------------------------------------------

export const createReferrerSchema = z.object({
  name: z.string().trim().min(1).max(160),
  phone: z.string().trim().max(30).optional(),
  category: z.string().trim().max(80).optional(),
  /** Suggested commission in basis points of the case's net billing. */
  commissionBps: z.number().int().min(0).max(10_000).nullish(),
});
export type CreateReferrerInput = z.infer<typeof createReferrerSchema>;

export const updateReferrerSchema = createReferrerSchema.partial().extend({
  phone: z.string().trim().max(30).nullish(),
  category: z.string().trim().max(80).nullish(),
  isActive: z.boolean().optional(),
});

export const referrerSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  phone: z.string().nullable(),
  category: z.string().nullable(),
  commissionBps: z.number().int().nullable(),
  isActive: z.boolean(),
  /** Cases attributed to this referrer, and what they billed. */
  caseCount: z.number().int(),
  referredNetMinor: z.number().int(),
  /** Commission already paid out. */
  paidMinor: z.number().int(),
});
export type Referrer = z.infer<typeof referrerSchema>;

export const createReferralPaymentSchema = z.object({
  referrerId: z.string().uuid(),
  amountMinor: z.number().int().min(1),
  paidAt: isoDateTimeSchema.optional(),
  periodFrom: isoDateSchema.optional(),
  periodTo: isoDateSchema.optional(),
  note: z.string().trim().max(500).optional(),
});
export type CreateReferralPaymentInput = z.infer<
  typeof createReferralPaymentSchema
>;

export const referralPaymentSchema = z.object({
  id: z.string().uuid(),
  referrerId: z.string().uuid(),
  referrerName: z.string(),
  amountMinor: z.number().int(),
  paidAt: isoDateTimeSchema,
  periodFrom: isoDateSchema.nullable(),
  periodTo: isoDateSchema.nullable(),
  note: z.string().nullable(),
});
export type ReferralPayment = z.infer<typeof referralPaymentSchema>;
