import type { Prisma } from '@prisma/client';
import { isReleasable, type ServiceOrder as ServiceOrderDto } from '@hms/shared';
import { toIsoDateTimeOrNull } from '../../common/util/dates.js';
import {
  patientSummarySelect,
  toPatientSummary,
} from '../patients/patients.mapper.js';

/**
 * The money side is denormalised onto the worklist row: a lab or radiology desk
 * needs `releasable` answered without a second call, and `releasable` is
 * computed from the linked bill line every time — never stored.
 */
export const serviceOrderInclude = {
  patient: { select: patientSummarySelect },
  billItem: {
    select: {
      status: true,
      netMinor: true,
      approvedWithoutPayment: true,
      approvalReason: true,
    },
  },
} as const;

export type ServiceOrderRow = Prisma.ServiceOrderGetPayload<{
  include: typeof serviceOrderInclude;
}>;

export function toServiceOrderDto(o: ServiceOrderRow): ServiceOrderDto {
  const billStatus = o.billItem?.status ?? null;
  const approvedWithoutPayment = o.billItem?.approvedWithoutPayment ?? false;
  return {
    id: o.id,
    serviceId: o.serviceId,
    serviceName: o.serviceName,
    department: o.department,
    status: o.status,
    note: o.note,
    orderedAt: o.orderedAt.toISOString(),
    startedAt: toIsoDateTimeOrNull(o.startedAt),
    completedAt: toIsoDateTimeOrNull(o.completedAt),
    cancelReason: o.cancelReason,

    caseId: o.caseId,
    opdVisitId: o.opdVisitId,
    patient: toPatientSummary(o.patient),

    billItemId: o.billItemId,
    billStatus,
    netMinor: o.billItem?.netMinor ?? null,
    approvedWithoutPayment,
    approvalReason: o.billItem?.approvalReason ?? null,
    releasable: isReleasable({ billStatus, approvedWithoutPayment }),
  };
}
