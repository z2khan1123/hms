import { z } from 'zod';

/** Third Party Administrator — the insurer or panel that settles a patient's bill. */
export const createTpaSchema = z.object({
  name: z.string().trim().min(1).max(160),
  code: z.string().trim().max(40).optional(),
  phone: z.string().trim().max(30).optional(),
  address: z.string().trim().max(300).optional(),
  contactPersonName: z.string().trim().max(120).optional(),
  contactPersonPhone: z.string().trim().max(30).optional(),
});
export type CreateTpaInput = z.infer<typeof createTpaSchema>;

export const updateTpaSchema = createTpaSchema.partial().extend({
  isActive: z.boolean().optional(),
});

export const tpaSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  code: z.string().nullable(),
  phone: z.string().nullable(),
  address: z.string().nullable(),
  contactPersonName: z.string().nullable(),
  contactPersonPhone: z.string().nullable(),
  isActive: z.boolean(),
});
export type Tpa = z.infer<typeof tpaSchema>;
