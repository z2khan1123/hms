import { z } from 'zod';
import { isoDateTimeSchema } from './common.js';
import { patientSummarySchema } from './patient.js';
import { practitionerSchema } from './practitioner.js';
import { caseBalanceSchema } from './case.js';
import { bedTypeSchema } from './ward.js';

export const admissionStatusSchema = z.enum([
  'admitted',
  'discharged',
  'cancelled',
]);
export type AdmissionStatus = z.infer<typeof admissionStatusSchema>;

export const ADMISSION_STATUS_LABELS: Record<AdmissionStatus, string> = {
  admitted: 'Admitted',
  discharged: 'Discharged',
  cancelled: 'Cancelled',
};

// --- admitting -------------------------------------------------------------

/**
 * Admit a patient. Attaches to an existing open case when one is given —
 * usually the OPD case the patient walked in on — otherwise a new case is
 * opened, so the inpatient stay bills onto the same episode as the consultation.
 */
export const admitPatientSchema = z.object({
  patientId: z.string().uuid(),
  caseId: z.string().uuid().optional(),
  /** Set when the patient is being moved in from an outpatient visit. */
  fromOpdVisitId: z.string().uuid().optional(),
  practitionerId: z.string().uuid(),
  bedId: z.string().uuid(),
  admittedAt: isoDateTimeSchema.optional(),
  provisionalDiagnosis: z.string().trim().max(1000).optional(),
  admissionNote: z.string().trim().max(2000).optional(),
});
export type AdmitPatientInput = z.infer<typeof admitPatientSchema>;

export const transferBedSchema = z.object({
  bedId: z.string().uuid(),
  reason: z.string().trim().max(300).optional(),
  movedAt: isoDateTimeSchema.optional(),
});
export type TransferBedInput = z.infer<typeof transferBedSchema>;

/**
 * Discharge. The bed charge is NOT posted silently every night — it is proposed
 * here from the bed type's suggested rate and whatever is confirmed goes on the
 * bill, same rule as everywhere else: the list suggests, the patient's file decides.
 */
export const dischargeSchema = z.object({
  dischargedAt: isoDateTimeSchema.optional(),
  dischargeSummary: z.string().trim().max(8000).optional(),
  dischargeAdvice: z.string().trim().max(4000).optional(),
  bedCharge: z
    .object({
      nights: z.number().int().min(0).max(3650),
      /** Per night, in minor units. Pre-filled from the bed type, always editable. */
      priceMinor: z.number().int().min(0),
      serviceId: z.string().uuid().optional(),
      serviceName: z.string().trim().min(1).max(160).optional(),
      discountBps: z.number().int().min(0).max(10_000).optional(),
      discountMinor: z.number().int().min(0).optional(),
      discountReason: z.string().trim().max(500).optional(),
    })
    .optional(),
});
export type DischargeInput = z.infer<typeof dischargeSchema>;

export const revertDischargeSchema = z.object({
  reason: z.string().trim().min(3).max(500),
});

// --- nurse notes -----------------------------------------------------------

export const createNurseNoteSchema = z.object({
  note: z.string().trim().min(1).max(4000),
  recordedAt: isoDateTimeSchema.optional(),
});
export type CreateNurseNoteInput = z.infer<typeof createNurseNoteSchema>;

export const nurseNoteSchema = z.object({
  id: z.string().uuid(),
  note: z.string(),
  recordedAt: isoDateTimeSchema,
  recordedBy: z.string().nullable(),
});
export type NurseNote = z.infer<typeof nurseNoteSchema>;

// --- read models -----------------------------------------------------------

export const bedPlacementSchema = z.object({
  bedId: z.string().uuid(),
  bedName: z.string(),
  wardName: z.string(),
  floorName: z.string(),
  bedType: bedTypeSchema,
});

export const bedAssignmentSchema = bedPlacementSchema.extend({
  id: z.string().uuid(),
  fromAt: isoDateTimeSchema,
  toAt: isoDateTimeSchema.nullable(),
  moveReason: z.string().nullable(),
});
export type BedAssignmentRecord = z.infer<typeof bedAssignmentSchema>;

export const admissionListItemSchema = z.object({
  id: z.string().uuid(),
  admissionNo: z.string(),
  status: admissionStatusSchema,
  admittedAt: isoDateTimeSchema,
  dischargedAt: isoDateTimeSchema.nullable(),
  patient: patientSummarySchema,
  practitioner: practitionerSchema,
  caseId: z.string().uuid(),
  caseNo: z.string(),
  currentBed: bedPlacementSchema.nullable(),
  /** Whole nights so far — the number the bed charge is proposed from. */
  nights: z.number().int(),
  balanceMinor: z.number().int(),
});
export type AdmissionListItem = z.infer<typeof admissionListItemSchema>;

export const admissionSchema = admissionListItemSchema.extend({
  provisionalDiagnosis: z.string().nullable(),
  admissionNote: z.string().nullable(),
  dischargeSummary: z.string().nullable(),
  dischargeAdvice: z.string().nullable(),
  revertedAt: isoDateTimeSchema.nullable(),
  revertReason: z.string().nullable(),
  fromOpdVisitId: z.string().uuid().nullable(),
  bedHistory: z.array(bedAssignmentSchema),
  caseBalance: caseBalanceSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Admission = z.infer<typeof admissionSchema>;

export const admissionListQuerySchema = z.object({
  status: admissionStatusSchema.optional(),
  practitionerId: z.string().uuid().optional(),
  patientId: z.string().uuid().optional(),
  wardId: z.string().uuid().optional(),
  q: z.string().trim().max(120).optional(),
});

/**
 * Whole nights between admission and discharge, floored, minimum zero — the
 * basis the bed charge is proposed from. Server and client must agree, or the
 * screen and the receipt would show different night counts.
 */
export function nightsBetween(
  admittedAt: string | Date,
  until: string | Date = new Date(),
): number {
  const a = new Date(admittedAt).getTime();
  const b = new Date(until).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) return 0;
  return Math.floor((b - a) / 86_400_000);
}
