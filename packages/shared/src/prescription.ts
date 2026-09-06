import { z } from 'zod';
import { isoDateTimeSchema } from './common.js';

/**
 * One line of a prescription; the "prescription" is every line on a visit.
 * Free text until the medicine master arrives with the pharmacy module — at
 * which point `drugName` gains an optional link to it without reshaping this.
 */
export const prescriptionItemInputSchema = z.object({
  drugName: z.string().trim().min(1).max(200),
  dose: z.string().trim().max(80).optional(),
  frequency: z.string().trim().max(80).optional(),
  durationDays: z.number().int().min(1).max(365).optional(),
  instructions: z.string().trim().max(500).optional(),
});
export type PrescriptionItemInput = z.infer<typeof prescriptionItemInputSchema>;

/** Replaces the whole prescription for a visit — simpler than per-line edits. */
export const setPrescriptionSchema = z.object({
  items: z.array(prescriptionItemInputSchema).max(50),
});
export type SetPrescriptionInput = z.infer<typeof setPrescriptionSchema>;

export const prescriptionItemSchema = prescriptionItemInputSchema.extend({
  id: z.string().uuid(),
  dose: z.string().nullable(),
  frequency: z.string().nullable(),
  durationDays: z.number().int().nullable(),
  instructions: z.string().nullable(),
  sortOrder: z.number().int(),
  createdAt: isoDateTimeSchema,
});
export type PrescriptionItem = z.infer<typeof prescriptionItemSchema>;

/** Common dosing shorthands, offered as suggestions rather than a fixed list. */
export const FREQUENCY_SUGGESTIONS = [
  'Once daily',
  'Twice daily',
  'Three times daily',
  'Four times daily',
  'Every 6 hours',
  'Every 8 hours',
  'At bedtime',
  'As needed',
] as const;
