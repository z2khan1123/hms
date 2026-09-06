import { z } from 'zod';

/** Which department a charge belongs to. Every billing module bills against this axis. */
export const chargeTypeKindSchema = z.enum([
  'opd',
  'ipd',
  'appointment',
  'pathology',
  'radiology',
  'pharmacy',
  'blood_bank',
  'ambulance',
  'operations',
  'investigations',
  'procedures',
  'supplies',
  'other',
]);
export type ChargeTypeKind = z.infer<typeof chargeTypeKindSchema>;

export const CHARGE_TYPE_LABELS: Record<ChargeTypeKind, string> = {
  opd: 'OPD',
  ipd: 'IPD',
  appointment: 'Appointment',
  pathology: 'Pathology',
  radiology: 'Radiology',
  pharmacy: 'Pharmacy',
  blood_bank: 'Blood Bank',
  ambulance: 'Ambulance',
  operations: 'Operations',
  investigations: 'Investigations',
  procedures: 'Procedures',
  supplies: 'Supplies',
  other: 'Other',
};

// --- Charge category -------------------------------------------------------

export const createChargeCategorySchema = z.object({
  name: z.string().trim().min(1).max(120),
  chargeType: chargeTypeKindSchema,
});
export type CreateChargeCategoryInput = z.infer<typeof createChargeCategorySchema>;

export const chargeCategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  chargeType: chargeTypeKindSchema,
  isActive: z.boolean(),
});
export type ChargeCategory = z.infer<typeof chargeCategorySchema>;

// --- Unit type -------------------------------------------------------------

export const createUnitTypeSchema = z.object({
  name: z.string().trim().min(1).max(60),
});
export const unitTypeSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  isActive: z.boolean(),
});
export type UnitType = z.infer<typeof unitTypeSchema>;

// --- Tax category ----------------------------------------------------------

export const createTaxCategorySchema = z.object({
  name: z.string().trim().min(1).max(60),
  /** Basis points: 1800 = 18.00%. Accepts 0. */
  rateBps: z.number().int().min(0).max(100_000),
});
export const taxCategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  rateBps: z.number().int(),
  isActive: z.boolean(),
});
export type TaxCategory = z.infer<typeof taxCategorySchema>;

// --- Charge ----------------------------------------------------------------

export const createChargeSchema = z.object({
  chargeCategoryId: z.string().uuid(),
  unitTypeId: z.string().uuid().optional(),
  taxCategoryId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(160),
  /** List price in minor units. */
  standardChargeMinor: z.number().int().min(0),
  description: z.string().trim().max(500).optional(),
});
export type CreateChargeInput = z.infer<typeof createChargeSchema>;

export const updateChargeSchema = createChargeSchema.partial().extend({
  isActive: z.boolean().optional(),
});
export type UpdateChargeInput = z.infer<typeof updateChargeSchema>;

export const chargeSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  standardChargeMinor: z.number().int(),
  description: z.string().nullable(),
  isActive: z.boolean(),
  chargeCategory: chargeCategorySchema,
  unitType: unitTypeSchema.nullable(),
  taxCategory: taxCategorySchema.nullable(),
});
export type Charge = z.infer<typeof chargeSchema>;

export const chargeListQuerySchema = z.object({
  chargeType: chargeTypeKindSchema.optional(),
  chargeCategoryId: z.string().uuid().optional(),
  q: z.string().trim().max(120).optional(),
  includeInactive: z.coerce.boolean().optional(),
});
