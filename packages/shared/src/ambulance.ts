import { z } from 'zod';
import { isoDateSchema, isoDateTimeSchema, booleanQuery, phoneSchema } from './common.js';
import { patientSummarySchema } from './patient.js';

/**
 * Ambulance: the vehicle registry and the call log.
 *
 * A call does not require a patient record. An ambulance is often dispatched to
 * a name and a phone number, and the person may never become a patient here —
 * demanding registration first would mean either a delayed dispatch or a
 * fictional patient, and both are worse than a nullable column.
 */

export const vehicleTypeSchema = z.enum([
  'basic',
  'advanced_life_support',
  'patient_transport',
  'mortuary',
]);
export type VehicleType = z.infer<typeof vehicleTypeSchema>;

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  basic: 'Basic',
  advanced_life_support: 'Advanced life support',
  patient_transport: 'Patient transport',
  mortuary: 'Mortuary',
};

export const createVehicleSchema = z.object({
  /** The plate. What dispatch actually says on the radio. */
  registrationNo: z.string().trim().min(1).max(40),
  model: z.string().trim().max(120).optional(),
  type: vehicleTypeSchema,
  driverName: z.string().trim().max(120).optional(),
  driverPhone: phoneSchema.optional(),
  /** Suggested charge. What is billed is set on the call. */
  baseChargeMinor: z.number().int().min(0).optional(),
  perKmChargeMinor: z.number().int().min(0).optional(),
  note: z.string().trim().max(500).optional(),
});
export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;

export const updateVehicleSchema = createVehicleSchema.partial().extend({
  model: z.string().trim().max(120).nullish(),
  driverName: z.string().trim().max(120).nullish(),
  driverPhone: phoneSchema.nullish(),
  baseChargeMinor: z.number().int().min(0).nullish(),
  perKmChargeMinor: z.number().int().min(0).nullish(),
  note: z.string().trim().max(500).nullish(),
  isActive: z.boolean().optional(),
});
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;

export const vehicleSchema = z.object({
  id: z.string().uuid(),
  registrationNo: z.string(),
  model: z.string().nullable(),
  type: vehicleTypeSchema,
  driverName: z.string().nullable(),
  driverPhone: z.string().nullable(),
  baseChargeMinor: z.number().int().nullable(),
  perKmChargeMinor: z.number().int().nullable(),
  note: z.string().nullable(),
  isActive: z.boolean(),
  /** Derived from open calls — a vehicle out on a job cannot be dispatched again. */
  isOnCall: z.boolean(),
});
export type Vehicle = z.infer<typeof vehicleSchema>;

export const vehicleListQuerySchema = z.object({
  type: vehicleTypeSchema.optional(),
  /** Only vehicles not currently out on a call. */
  availableOnly: booleanQuery.optional(),
  includeInactive: booleanQuery.optional(),
});

// --- calls -----------------------------------------------------------------

export const emergencyLevelSchema = z.enum(['critical', 'urgent', 'routine']);
export type EmergencyLevel = z.infer<typeof emergencyLevelSchema>;

export const EMERGENCY_LEVEL_LABELS: Record<EmergencyLevel, string> = {
  critical: 'Critical',
  urgent: 'Urgent',
  routine: 'Routine',
};

/**
 * Where a call has got to. Derived from the timestamps rather than stored, for
 * the same reason every other stage in this system is: one fact, one place.
 */
export const callStageSchema = z.enum([
  'dispatched',
  'arrived',
  'completed',
  'cancelled',
]);
export type CallStage = z.infer<typeof callStageSchema>;

export const CALL_STAGE_LABELS: Record<CallStage, string> = {
  dispatched: 'Dispatched',
  arrived: 'Arrived',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export function callStageOf(input: {
  cancelledAt?: string | null;
  completedAt?: string | null;
  arrivedAt?: string | null;
}): CallStage {
  if (input.cancelledAt) return 'cancelled';
  if (input.completedAt) return 'completed';
  if (input.arrivedAt) return 'arrived';
  return 'dispatched';
}

export const createCallSchema = z.object({
  vehicleId: z.string().uuid(),
  /** Omit for someone who is not a patient here — the common case. */
  patientId: z.string().uuid().optional(),
  /** Required when there is no patient record, so the log names somebody. */
  callerName: z.string().trim().max(120).optional(),
  callerPhone: phoneSchema.optional(),
  emergencyLevel: emergencyLevelSchema,
  pickupAddress: z.string().trim().min(1).max(300),
  dropAddress: z.string().trim().max(300).optional(),
  dispatchedAt: isoDateTimeSchema.optional(),
  note: z.string().trim().max(500).optional(),
});
export type CreateCallInput = z.infer<typeof createCallSchema>;

export const completeCallSchema = z.object({
  arrivedAt: isoDateTimeSchema.optional(),
  completedAt: isoDateTimeSchema.optional(),
  distanceKm: z.number().min(0).max(10_000).optional(),
  /**
   * What to charge. Left out, the call is logged without a bill — an ambulance
   * sent to a road accident is not always somebody's invoice.
   */
  chargeMinor: z.number().int().min(0).optional(),
  /** Required to bill: a charge has to land on somebody's case. */
  patientId: z.string().uuid().optional(),
  caseId: z.string().uuid().optional(),
  note: z.string().trim().max(500).optional(),
});
export type CompleteCallInput = z.infer<typeof completeCallSchema>;

export const cancelCallSchema = z.object({
  reason: z.string().trim().min(2).max(300),
});

export const ambulanceCallSchema = z.object({
  id: z.string().uuid(),
  callNo: z.string(),
  vehicle: vehicleSchema,
  patient: patientSummarySchema.nullable(),
  callerName: z.string().nullable(),
  callerPhone: z.string().nullable(),
  emergencyLevel: emergencyLevelSchema,
  pickupAddress: z.string(),
  dropAddress: z.string().nullable(),
  dispatchedAt: isoDateTimeSchema,
  arrivedAt: isoDateTimeSchema.nullable(),
  completedAt: isoDateTimeSchema.nullable(),
  cancelledAt: isoDateTimeSchema.nullable(),
  cancelReason: z.string().nullable(),
  distanceKm: z.number().nullable(),
  chargeMinor: z.number().int().nullable(),
  billItemId: z.string().uuid().nullable(),
  caseId: z.string().uuid().nullable(),
  note: z.string().nullable(),
  stage: callStageSchema,
  /** Minutes from dispatch to arrival. The number a service is judged on. */
  responseMinutes: z.number().int().nullable(),
});
export type AmbulanceCall = z.infer<typeof ambulanceCallSchema>;

export const callListQuerySchema = z.object({
  vehicleId: z.string().uuid().optional(),
  stage: callStageSchema.optional(),
  emergencyLevel: emergencyLevelSchema.optional(),
  patientId: z.string().uuid().optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  q: z.string().trim().max(120).optional(),
});

/**
 * Suggested charge: a base plus a per-kilometre rate, in minor units, rounded
 * to the paisa. Only ever pre-fills the field — what is billed is what the
 * operator confirms. Shared so the screen and the receipt agree.
 */
export function suggestedCallCharge(input: {
  baseChargeMinor?: number | null;
  perKmChargeMinor?: number | null;
  distanceKm?: number | null;
}): number {
  const base = input.baseChargeMinor ?? 0;
  const perKm = input.perKmChargeMinor ?? 0;
  const km = input.distanceKm ?? 0;
  return Math.max(0, base + Math.round(perKm * km));
}

/** Whole minutes from dispatch to arrival, or null while still en route. */
export function responseMinutes(
  dispatchedAt: string,
  arrivedAt: string | null | undefined,
): number | null {
  if (!arrivedAt) return null;
  const a = new Date(dispatchedAt).getTime();
  const b = new Date(arrivedAt).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null;
  return Math.round((b - a) / 60_000);
}
