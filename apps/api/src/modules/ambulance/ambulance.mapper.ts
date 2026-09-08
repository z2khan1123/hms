import type { Prisma } from '@prisma/client';
import {
  type AmbulanceCall as AmbulanceCallDto,
  type Vehicle as VehicleDto,
  callStageOf,
  responseMinutes,
} from '@hms/shared';
import { toIsoDateTimeOrNull } from '../../common/util/dates.js';
import { toPatientSummary } from '../patients/patients.mapper.js';

/**
 * A vehicle is "on call" when it has an open call — derived, never a stored
 * flag. A crashed process or a forgotten click would otherwise strand an
 * ambulance as permanently unavailable on the board while it sits in the yard.
 */
export const vehicleInclude = {
  calls: {
    where: { completedAt: null, cancelledAt: null },
    select: { id: true },
  },
} as const;

export type VehicleRow = Prisma.VehicleGetPayload<{
  include: typeof vehicleInclude;
}>;

export function toVehicleDto(r: VehicleRow): VehicleDto {
  return {
    id: r.id,
    registrationNo: r.registrationNo,
    model: r.model,
    type: r.type,
    driverName: r.driverName,
    driverPhone: r.driverPhone,
    baseChargeMinor: r.baseChargeMinor,
    perKmChargeMinor: r.perKmChargeMinor,
    note: r.note,
    isActive: r.isActive,
    isOnCall: r.calls.length > 0,
  };
}

export const callInclude = {
  vehicle: { include: vehicleInclude },
  patient: true,
} as const;

export type CallRow = Prisma.AmbulanceCallGetPayload<{
  include: typeof callInclude;
}>;

export function toCallDto(r: CallRow): AmbulanceCallDto {
  const dispatchedAt = r.dispatchedAt.toISOString();
  const arrivedAt = toIsoDateTimeOrNull(r.arrivedAt);
  return {
    id: r.id,
    callNo: r.callNo,
    vehicle: toVehicleDto(r.vehicle),
    patient: r.patient ? toPatientSummary(r.patient) : null,
    callerName: r.callerName,
    callerPhone: r.callerPhone,
    emergencyLevel: r.emergencyLevel,
    pickupAddress: r.pickupAddress,
    dropAddress: r.dropAddress,
    dispatchedAt,
    arrivedAt,
    completedAt: toIsoDateTimeOrNull(r.completedAt),
    cancelledAt: toIsoDateTimeOrNull(r.cancelledAt),
    cancelReason: r.cancelReason,
    distanceKm: r.distanceKm,
    chargeMinor: r.chargeMinor,
    billItemId: r.billItemId,
    caseId: r.caseId,
    note: r.note,
    stage: callStageOf({
      cancelledAt: toIsoDateTimeOrNull(r.cancelledAt),
      completedAt: toIsoDateTimeOrNull(r.completedAt),
      arrivedAt,
    }),
    responseMinutes: responseMinutes(dispatchedAt, arrivedAt),
  };
}
