import { z } from 'zod';
import { isoDateSchema } from '@hms/shared';

/**
 * Query shapes that are NOT part of the frozen `@hms/shared` contract. The
 * ledger head schemas, the referrer/payment schemas and the `LedgerSummary` DTO
 * all come from `@hms/shared`; only these two small filters are local.
 */

/** `GET /finance/summary?from=&to=` — an inclusive calendar-date window. */
export const financeSummaryQuerySchema = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});
export type FinanceSummaryQuery = z.infer<typeof financeSummaryQuerySchema>;

/** `GET /referrals/payments?referrerId=` */
export const referralPaymentListQuerySchema = z.object({
  referrerId: z.string().uuid().optional(),
});
export type ReferralPaymentListQuery = z.infer<
  typeof referralPaymentListQuerySchema
>;
