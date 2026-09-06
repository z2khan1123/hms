import { z } from 'zod';

export const createPractitionerSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  specialty: z.string().trim().max(120).optional(),
  department: z.string().trim().max(120).optional(),
  /**
   * The doctor's consultation fee. Shown automatically at registration and
   * always editable — a doctor may concede a fee for a particular patient.
   * `null` clears it.
   */
  consultationFeeMinor: z.number().int().min(0).nullish(),
});
export type CreatePractitionerInput = z.infer<typeof createPractitionerSchema>;

export const updatePractitionerSchema = createPractitionerSchema.partial().extend({
  specialty: z.string().trim().max(120).nullish(),
  department: z.string().trim().max(120).nullish(),
  isActive: z.boolean().optional(),
});
export type UpdatePractitionerInput = z.infer<typeof updatePractitionerSchema>;

export const practitionerSchema = z.object({
  id: z.string().uuid(),
  firstName: z.string(),
  lastName: z.string(),
  specialty: z.string().nullable(),
  department: z.string().nullable(),
  consultationFeeMinor: z.number().int().nullable(),
  isActive: z.boolean(),
});
export type Practitioner = z.infer<typeof practitionerSchema>;
