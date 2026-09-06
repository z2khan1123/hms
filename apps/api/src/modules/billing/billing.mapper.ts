import type { BillItem, Payment } from '@prisma/client';
import type { BillItem as BillItemDto, Payment as PaymentDto } from '@hms/shared';
import { toIsoDateOrNull, toIsoDateTimeOrNull } from '../../common/util/dates.js';

export function toBillItemDto(b: BillItem): BillItemDto {
  return {
    id: b.id,
    status: b.status,
    paymentId: b.paymentId,
    approvedWithoutPayment: b.approvedWithoutPayment,
    approvalReason: b.approvalReason,
    discountReason: b.discountReason,
    serviceId: b.serviceId,
    serviceName: b.serviceName,
    department: b.department,
    quantity: b.quantity,
    defaultPriceMinor: b.defaultPriceMinor,
    priceMinor: b.priceMinor,
    discountBps: b.discountBps,
    discountMinor: b.discountMinor,
    netMinor: b.netMinor,
    note: b.note,
    chargedAt: b.chargedAt.toISOString(),
    opdVisitId: b.opdVisitId,
  };
}

export function toPaymentDto(p: Payment): PaymentDto {
  return {
    id: p.id,
    receiptNo: p.receiptNo,
    amountMinor: p.amountMinor,
    mode: p.mode,
    paidAt: p.paidAt.toISOString(),
    note: p.note,
    chequeNo: p.chequeNo,
    chequeDate: toIsoDateOrNull(p.chequeDate),
    documentUrl: p.documentUrl,
    reversedAt: toIsoDateTimeOrNull(p.reversedAt),
    reversalReason: p.reversalReason,
  };
}
