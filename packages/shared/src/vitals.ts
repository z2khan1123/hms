import { z } from 'zod';
import { isoDateTimeSchema } from './common.js';

export const vitalFlagSchema = z.enum(['low', 'normal', 'high']);
export type VitalFlag = z.infer<typeof vitalFlagSchema>;

export const createVitalTypeSchema = z.object({
  name: z.string().trim().min(1).max(80),
  unit: z.string().trim().min(1).max(30),
  refLow: z.number().optional(),
  refHigh: z.number().optional(),
});

export const vitalTypeSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  unit: z.string(),
  refLow: z.number().nullable(),
  refHigh: z.number().nullable(),
  isActive: z.boolean(),
});
export type VitalType = z.infer<typeof vitalTypeSchema>;

export const recordVitalsSchema = z.object({
  patientId: z.string().uuid(),
  caseId: z.string().uuid().optional(),
  opdVisitId: z.string().uuid().optional(),
  /** Set for vitals taken on a ward round rather than in clinic. */
  admissionId: z.string().uuid().optional(),
  recordedAt: isoDateTimeSchema.optional(),
  readings: z
    .array(
      z.object({
        vitalTypeId: z.string().uuid(),
        value: z.number(),
      }),
    )
    .min(1)
    .max(30),
});
export type RecordVitalsInput = z.infer<typeof recordVitalsSchema>;

export const vitalReadingSchema = z.object({
  id: z.string().uuid(),
  value: z.number(),
  flag: vitalFlagSchema.nullable(),
  recordedAt: isoDateTimeSchema,
  vitalType: vitalTypeSchema,
});
export type VitalReading = z.infer<typeof vitalReadingSchema>;

/** Server and client must agree on what counts as abnormal. */
export function flagFor(
  value: number,
  refLow: number | null | undefined,
  refHigh: number | null | undefined,
): VitalFlag | null {
  if (refLow == null && refHigh == null) return null;
  if (refLow != null && value < refLow) return 'low';
  if (refHigh != null && value > refHigh) return 'high';
  return 'normal';
}
