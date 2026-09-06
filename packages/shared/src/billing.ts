import { z } from 'zod';
import { isoDateSchema, isoDateTimeSchema } from './common.js';
import { chargeTypeKindSchema } from './charge-master.js';

export const paymentModeSchema = z.enum([
  'cash',
  'cheque',
  'bank_transfer',
  'card',
  'online',
  'other',
]);
export type PaymentMode = z.infer<typeof paymentModeSchema>;

export const PAYMENT_MODE_LABELS: Record<PaymentMode, string> = {
  cash: 'Cash',
  cheque: 'Cheque',
  bank_transfer: 'Bank transfer',
  card: 'Card',
  online: 'Online',
  other: 'Other',
};

// --- charge items ----------------------------------------------------------

export const addChargeItemSchema = z
  .object({
    caseId: z.string().uuid(),
    opdVisitId: z.string().uuid().optional(),
    chargeId: z.string().uuid(),
    quantity: z.number().int().min(1).max(999).optional(),
    /** Defaults to the charge's standard price when omitted. */
    appliedChargeMinor: z.number().int().min(0).optional(),
    discountBps: z.number().int().min(0).max(10_000).optional(),
    discountMinor: z.number().int().min(0).optional(),
    /** Defaults to the charge's tax category rate when omitted. */
    taxBps: z.number().int().min(0).max(100_000).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .refine((v) => !(v.discountBps !== undefined && v.discountMinor !== undefined), {
    message: 'Give a percentage discount or a flat discount, not both',
    path: ['discountMinor'],
  });
export type AddChargeItemInput = z.infer<typeof addChargeItemSchema>;

export const chargeItemSchema = z.object({
  id: z.string().uuid(),
  chargeId: z.string().uuid().nullable(),
  chargeName: z.string(),
  chargeType: chargeTypeKindSchema,
  quantity: z.number().int(),
  standardChargeMinor: z.number().int(),
  appliedChargeMinor: z.number().int(),
  discountBps: z.number().int(),
  discountMinor: z.number().int(),
  taxBps: z.number().int(),
  taxMinor: z.number().int(),
  netMinor: z.number().int(),
  note: z.string().nullable(),
  chargedAt: isoDateTimeSchema,
  opdVisitId: z.string().uuid().nullable(),
});
export type ChargeItem = z.infer<typeof chargeItemSchema>;

// --- payments --------------------------------------------------------------

export const createPaymentSchema = z
  .object({
    caseId: z.string().uuid(),
    amountMinor: z.number().int().min(1),
    mode: paymentModeSchema,
    paidAt: isoDateTimeSchema.optional(),
    note: z.string().trim().max(500).optional(),
    chequeNo: z.string().trim().max(60).optional(),
    chequeDate: isoDateSchema.optional(),
    documentUrl: z.string().trim().url().max(2048).optional(),
  })
  .refine((v) => v.mode !== 'cheque' || (!!v.chequeNo && !!v.chequeDate), {
    message: 'Cheque number and date are required for cheque payments',
    path: ['chequeNo'],
  });
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

export const reversePaymentSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

export const paymentSchema = z.object({
  id: z.string().uuid(),
  receiptNo: z.string(),
  amountMinor: z.number().int(),
  mode: paymentModeSchema,
  paidAt: isoDateTimeSchema,
  note: z.string().nullable(),
  chequeNo: z.string().nullable(),
  chequeDate: isoDateSchema.nullable(),
  documentUrl: z.string().nullable(),
  reversedAt: isoDateTimeSchema.nullable(),
  reversalReason: z.string().nullable(),
});
export type Payment = z.infer<typeof paymentSchema>;

// --- the bill --------------------------------------------------------------

/** Everything the receipt and the case billing tab need, in one response. */
export const caseLedgerSchema = z.object({
  caseId: z.string().uuid(),
  caseNo: z.string(),
  currency: z.string(),
  items: z.array(chargeItemSchema),
  payments: z.array(paymentSchema),
  grossMinor: z.number().int(),
  discountMinor: z.number().int(),
  taxMinor: z.number().int(),
  netMinor: z.number().int(),
  paidMinor: z.number().int(),
  balanceMinor: z.number().int(),
});
export type CaseLedger = z.infer<typeof caseLedgerSchema>;
