import type { ChargeItem, Payment } from '@prisma/client';
import type { ChargeItem as ChargeItemDto, Payment as PaymentDto } from '@hms/shared';
import { toIsoDateOrNull, toIsoDateTimeOrNull } from '../../common/util/dates.js';

export function toChargeItemDto(c: ChargeItem): ChargeItemDto {
  return {
    id: c.id,
    chargeId: c.chargeId,
    chargeName: c.chargeName,
    chargeType: c.chargeType,
    quantity: c.quantity,
    standardChargeMinor: c.standardChargeMinor,
    appliedChargeMinor: c.appliedChargeMinor,
    discountBps: c.discountBps,
    discountMinor: c.discountMinor,
    taxBps: c.taxBps,
    taxMinor: c.taxMinor,
    netMinor: c.netMinor,
    note: c.note,
    chargedAt: c.chargedAt.toISOString(),
    opdVisitId: c.opdVisitId,
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
