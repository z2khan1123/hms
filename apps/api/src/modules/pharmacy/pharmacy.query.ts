import { z } from 'zod';

/**
 * Query/body shapes that are NOT part of the frozen `@hms/shared` contract.
 * The list filters for batches and dispenses, and the allergy-check body, are
 * local to the API; everything the web client and API must agree on (the DTOs,
 * the create schemas, `matchAllergy`) still comes from `@hms/shared`.
 */

const boolParam = z
  .union([z.literal('true'), z.literal('false'), z.boolean()])
  .transform((v) => v === true || v === 'true')
  .optional();

export const batchListQuerySchema = z.object({
  medicineId: z.string().uuid().optional(),
  expiringInDays: z.coerce.number().int().min(0).max(3650).optional(),
  includeEmpty: boolParam,
});
export type BatchListQuery = z.infer<typeof batchListQuerySchema>;

export const dispenseListQuerySchema = z.object({
  patientId: z.string().uuid().optional(),
  caseId: z.string().uuid().optional(),
});
export type DispenseListQuery = z.infer<typeof dispenseListQuerySchema>;

export const allergyCheckSchema = z.object({
  patientId: z.string().uuid(),
  medicineIds: z.array(z.string().uuid()).min(1).max(100),
});
export type AllergyCheckInput = z.infer<typeof allergyCheckSchema>;
