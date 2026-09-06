import { z } from 'zod';
import { isoDateSchema, isoDateTimeSchema } from './common.js';
import { serviceDepartmentSchema } from './services.js';
import { billItemStatusSchema } from './orders.js';
import { patientSummarySchema } from './patient.js';

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

// --- bill items ------------------------------------------------------------

/**
 * A line on the patient's bill. Either pick a service from the list (`serviceId`,
 * which keeps the name consistent for reporting) or type a one-off `serviceName`.
 * `priceMinor` is always required and always what this patient is charged — the
 * service's suggested price only pre-fills the field in the UI.
 */
export const addBillItemSchema = z
  .object({
    caseId: z.string().uuid(),
    opdVisitId: z.string().uuid().optional(),
    serviceId: z.string().uuid().optional(),
    /** Required only when no `serviceId` is given. */
    serviceName: z.string().trim().min(1).max(160).optional(),
    department: serviceDepartmentSchema.optional(),
    priceMinor: z.number().int().min(0),
    quantity: z.number().int().min(1).max(999).optional(),
    discountBps: z.number().int().min(0).max(10_000).optional(),
    discountMinor: z.number().int().min(0).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .refine((v) => !!v.serviceId || !!v.serviceName, {
    message: 'Pick a service or enter a name',
    path: ['serviceName'],
  })
  .refine((v) => !(v.discountBps !== undefined && v.discountMinor !== undefined), {
    message: 'Give a percentage discount or a flat discount, not both',
    path: ['discountMinor'],
  });
export type AddBillItemInput = z.infer<typeof addBillItemSchema>;

export const billItemSchema = z.object({
  id: z.string().uuid(),
  status: billItemStatusSchema,
  /** The receipt that settled this line, if any. */
  paymentId: z.string().uuid().nullable(),
  approvedWithoutPayment: z.boolean(),
  approvalReason: z.string().nullable(),
  discountReason: z.string().nullable(),
  serviceId: z.string().uuid().nullable(),
  serviceName: z.string(),
  department: serviceDepartmentSchema.nullable(),
  quantity: z.number().int(),
  defaultPriceMinor: z.number().int().nullable(),
  priceMinor: z.number().int(),
  discountBps: z.number().int(),
  discountMinor: z.number().int(),
  netMinor: z.number().int(),
  note: z.string().nullable(),
  chargedAt: isoDateTimeSchema,
  opdVisitId: z.string().uuid().nullable(),
});
export type BillItem = z.infer<typeof billItemSchema>;

// --- payments --------------------------------------------------------------

export const createPaymentSchema = z
  .object({
    caseId: z.string().uuid(),
    /**
     * The lines this payment settles. Supply them and the receipt itemises what
     * was paid for and those lines become `paid` — this is what makes
     * "pay for this test now" and "settle everything at the end" the same code
     * path. Omit for an unallocated advance; the amount must then still be > 0.
     */
    billItemIds: z.array(z.string().uuid()).max(100).optional(),
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
  items: z.array(billItemSchema),
  payments: z.array(paymentSchema),
  grossMinor: z.number().int(),
  discountMinor: z.number().int(),
  netMinor: z.number().int(),
  paidMinor: z.number().int(),
  balanceMinor: z.number().int(),
});
export type CaseLedger = z.infer<typeof caseLedgerSchema>;

/** Release an unpaid line to its department — a panel patient, or a waiver. */
export const approveBillItemSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

/**
 * The cashier's queue: every patient with money outstanding, newest first.
 * One row per case, so the counter settles a patient rather than a line.
 */
export const pendingChargeGroupSchema = z.object({
  caseId: z.string().uuid(),
  caseNo: z.string(),
  patient: patientSummarySchema,
  items: z.array(billItemSchema),
  pendingCount: z.number().int(),
  pendingMinor: z.number().int(),
  oldestPendingAt: isoDateTimeSchema,
});
export type PendingChargeGroup = z.infer<typeof pendingChargeGroupSchema>;
