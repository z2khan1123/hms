import { z } from 'zod';
import { isoDateTimeSchema } from './common.js';
import { patientSummarySchema } from './patient.js';
import { serviceDepartmentSchema } from './services.js';

/**
 * Work state of a doctor's order. Whether it may START is decided by the linked
 * bill item (paid, or approved without payment) — never duplicated here, so the
 * money and the work can never disagree.
 */
export const serviceOrderStatusSchema = z.enum([
  'ordered',
  'in_progress',
  'completed',
  'cancelled',
]);
export type ServiceOrderStatus = z.infer<typeof serviceOrderStatusSchema>;

export const SERVICE_ORDER_STATUS_LABELS: Record<ServiceOrderStatus, string> = {
  ordered: 'Ordered',
  in_progress: 'In progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/** Money state of the order's bill line. */
export const billItemStatusSchema = z.enum([
  'pending',
  'paid',
  'cancelled',
  'refunded',
]);
export type BillItemStatus = z.infer<typeof billItemStatusSchema>;

export const BILL_ITEM_STATUS_LABELS: Record<BillItemStatus, string> = {
  pending: 'Payment pending',
  paid: 'Paid',
  cancelled: 'Cancelled',
  refunded: 'Refunded',
};

// --- placing orders --------------------------------------------------------

/**
 * The doctor recommends services. Each becomes a pending charge on the patient's
 * bill in the same transaction — a recommendation the cashier never sees is how
 * revenue goes missing.
 */
export const createServiceOrdersSchema = z.object({
  opdVisitId: z.string().uuid(),
  orders: z
    .array(
      z.object({
        serviceId: z.string().uuid().optional(),
        /** Required only when no `serviceId` is given. */
        serviceName: z.string().trim().min(1).max(160).optional(),
        /** Defaults to the service's suggested price; the counter can still change it. */
        priceMinor: z.number().int().min(0).optional(),
        quantity: z.number().int().min(1).max(99).optional(),
        note: z.string().trim().max(500).optional(),
      }),
    )
    .min(1)
    .max(30),
});
export type CreateServiceOrdersInput = z.infer<typeof createServiceOrdersSchema>;

export const setServiceOrderStatusSchema = z.object({
  status: serviceOrderStatusSchema,
  reason: z.string().trim().max(500).optional(),
});

// --- read models -----------------------------------------------------------

export const serviceOrderSchema = z.object({
  id: z.string().uuid(),
  serviceId: z.string().uuid().nullable(),
  serviceName: z.string(),
  department: serviceDepartmentSchema.nullable(),
  status: serviceOrderStatusSchema,
  note: z.string().nullable(),
  orderedAt: isoDateTimeSchema,
  startedAt: isoDateTimeSchema.nullable(),
  completedAt: isoDateTimeSchema.nullable(),
  cancelReason: z.string().nullable(),

  caseId: z.string().uuid(),
  opdVisitId: z.string().uuid().nullable(),
  patient: patientSummarySchema,

  // money side, denormalised for the worklist
  billItemId: z.string().uuid().nullable(),
  billStatus: billItemStatusSchema.nullable(),
  netMinor: z.number().int().nullable(),
  approvedWithoutPayment: z.boolean(),
  approvalReason: z.string().nullable(),
  /**
   * The single question a lab or radiology desk needs answered: may I start?
   * True when the bill line is paid, or when it was approved without payment.
   */
  releasable: z.boolean(),
});
export type ServiceOrder = z.infer<typeof serviceOrderSchema>;

export const serviceOrderListQuerySchema = z.object({
  department: serviceDepartmentSchema.optional(),
  status: serviceOrderStatusSchema.optional(),
  patientId: z.string().uuid().optional(),
  opdVisitId: z.string().uuid().optional(),
  caseId: z.string().uuid().optional(),
  /** Department worklists default to hiding orders that are not yet payable. */
  releasableOnly: z.coerce.boolean().optional(),
  q: z.string().trim().max(120).optional(),
});

/** Server and client must agree on when a department may start work. */
export function isReleasable(input: {
  billStatus: BillItemStatus | null;
  approvedWithoutPayment: boolean;
}): boolean {
  return input.approvedWithoutPayment || input.billStatus === 'paid';
}
