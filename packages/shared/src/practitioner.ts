import { z } from 'zod';

export const createPractitionerSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  specialty: z.string().trim().max(120).optional(),
});
export type CreatePractitionerInput = z.infer<typeof createPractitionerSchema>;

export const practitionerSchema = z.object({
  id: z.string().uuid(),
  firstName: z.string(),
  lastName: z.string(),
  specialty: z.string().nullable(),
  isActive: z.boolean(),
});
export type Practitioner = z.infer<typeof practitionerSchema>;
