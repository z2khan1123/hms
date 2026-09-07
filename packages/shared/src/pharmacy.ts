import { z } from 'zod';
import { isoDateSchema, isoDateTimeSchema } from './common.js';
import { patientSummarySchema } from './patient.js';

// --- allergies -------------------------------------------------------------

export const allergySeveritySchema = z.enum(['mild', 'moderate', 'severe']);
export type AllergySeverity = z.infer<typeof allergySeveritySchema>;

export const ALLERGY_SEVERITY_LABELS: Record<AllergySeverity, string> = {
  mild: 'Mild',
  moderate: 'Moderate',
  severe: 'Severe',
};

/**
 * A patient's allergies recorded as records rather than one free-text blob, so
 * prescribing can actually reason over them. The blob on the patient stays as
 * the doctor's own words; this is what the software checks.
 */
export const createPatientAllergySchema = z.object({
  substance: z.string().trim().min(2).max(120),
  reaction: z.string().trim().max(300).optional(),
  severity: allergySeveritySchema.optional(),
});
export type CreatePatientAllergyInput = z.infer<
  typeof createPatientAllergySchema
>;

export const patientAllergySchema = z.object({
  id: z.string().uuid(),
  substance: z.string(),
  reaction: z.string().nullable(),
  severity: allergySeveritySchema,
  recordedAt: isoDateTimeSchema,
  recordedBy: z.string().nullable(),
});
export type PatientAllergy = z.infer<typeof patientAllergySchema>;

// --- medicine master -------------------------------------------------------

export const createMedicineCategorySchema = z.object({
  name: z.string().trim().min(1).max(80),
});
export const medicineCategorySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  isActive: z.boolean(),
});
export type MedicineCategory = z.infer<typeof medicineCategorySchema>;

export const createMedicineSchema = z.object({
  name: z.string().trim().min(1).max(160),
  genericName: z.string().trim().max(160).optional(),
  categoryId: z.string().uuid().optional(),
  company: z.string().trim().max(120).optional(),
  strength: z.string().trim().max(60).optional(),
  /** Unit stock is counted in: tablet, capsule, bottle, vial. */
  unit: z.string().trim().max(40).optional(),
  reorderLevel: z.number().int().min(0).max(1_000_000).optional(),
  /**
   * Substances this contains, checked against the patient's recorded allergies
   * when it is prescribed. Keywords rather than a coded terminology — honest
   * about what it is, and it still catches "penicillin" in a doctor's own words.
   */
  allergenKeywords: z.array(z.string().trim().min(2).max(60)).max(20).optional(),
});
export type CreateMedicineInput = z.infer<typeof createMedicineSchema>;

export const updateMedicineSchema = createMedicineSchema.partial().extend({
  genericName: z.string().trim().max(160).nullish(),
  categoryId: z.string().uuid().nullish(),
  company: z.string().trim().max(120).nullish(),
  strength: z.string().trim().max(60).nullish(),
  unit: z.string().trim().max(40).nullish(),
  reorderLevel: z.number().int().min(0).nullish(),
  isActive: z.boolean().optional(),
});

export const medicineSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  genericName: z.string().nullable(),
  category: medicineCategorySchema.nullable(),
  company: z.string().nullable(),
  strength: z.string().nullable(),
  unit: z.string().nullable(),
  reorderLevel: z.number().int().nullable(),
  allergenKeywords: z.array(z.string()),
  isActive: z.boolean(),
  /** Summed across batches that have not expired. */
  stockOnHand: z.number().int(),
  /** True when `stockOnHand` has fallen to or below `reorderLevel`. */
  belowReorderLevel: z.boolean(),
  /** Earliest expiry still holding stock, so a pharmacist can act on it. */
  nextExpiryDate: isoDateSchema.nullable(),
});
export type Medicine = z.infer<typeof medicineSchema>;

export const medicineListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  categoryId: z.string().uuid().optional(),
  /** Only medicines at or below their reorder level. */
  lowStockOnly: z.coerce.boolean().optional(),
  includeInactive: z.coerce.boolean().optional(),
});

// --- batches and purchasing ------------------------------------------------

export const medicineBatchSchema = z.object({
  id: z.string().uuid(),
  medicineId: z.string().uuid(),
  medicineName: z.string(),
  batchNo: z.string(),
  expiryDate: isoDateSchema,
  quantity: z.number().int(),
  purchasePriceMinor: z.number().int().nullable(),
  salePriceMinor: z.number().int().nullable(),
  /** Computed against today, so an expired batch cannot be dispensed by mistake. */
  isExpired: z.boolean(),
});
export type MedicineBatch = z.infer<typeof medicineBatchSchema>;

export const createPurchaseSchema = z.object({
  supplierName: z.string().trim().min(1).max(160),
  invoiceNo: z.string().trim().max(80).optional(),
  purchasedAt: isoDateTimeSchema.optional(),
  note: z.string().trim().max(500).optional(),
  items: z
    .array(
      z.object({
        medicineId: z.string().uuid(),
        batchNo: z.string().trim().min(1).max(60),
        expiryDate: isoDateSchema,
        quantity: z.number().int().min(1).max(1_000_000),
        purchasePriceMinor: z.number().int().min(0),
        salePriceMinor: z.number().int().min(0).optional(),
      }),
    )
    .min(1)
    .max(100),
});
export type CreatePurchaseInput = z.infer<typeof createPurchaseSchema>;

export const purchaseSchema = z.object({
  id: z.string().uuid(),
  supplierName: z.string(),
  invoiceNo: z.string().nullable(),
  purchasedAt: isoDateTimeSchema,
  note: z.string().nullable(),
  totalMinor: z.number().int(),
  items: z.array(
    z.object({
      id: z.string().uuid(),
      medicineId: z.string().uuid(),
      medicineName: z.string(),
      batchNo: z.string(),
      expiryDate: isoDateSchema,
      quantity: z.number().int(),
      purchasePriceMinor: z.number().int(),
      salePriceMinor: z.number().int().nullable(),
      lineTotalMinor: z.number().int(),
    }),
  ),
});
export type Purchase = z.infer<typeof purchaseSchema>;

// --- dispensing ------------------------------------------------------------

export const createDispenseSchema = z.object({
  patientId: z.string().uuid(),
  caseId: z.string().uuid().optional(),
  opdVisitId: z.string().uuid().optional(),
  admissionId: z.string().uuid().optional(),
  note: z.string().trim().max(500).optional(),
  items: z
    .array(
      z.object({
        batchId: z.string().uuid(),
        quantity: z.number().int().min(1).max(100_000),
        /** Defaults to the batch's sale price; the counter can still change it. */
        unitPriceMinor: z.number().int().min(0).optional(),
      }),
    )
    .min(1)
    .max(60),
});
export type CreateDispenseInput = z.infer<typeof createDispenseSchema>;

export const dispenseSchema = z.object({
  id: z.string().uuid(),
  patient: patientSummarySchema,
  caseId: z.string().uuid(),
  caseNo: z.string(),
  dispensedAt: isoDateTimeSchema,
  dispensedBy: z.string().nullable(),
  note: z.string().nullable(),
  billItemId: z.string().uuid().nullable(),
  totalMinor: z.number().int(),
  items: z.array(
    z.object({
      id: z.string().uuid(),
      medicineId: z.string().uuid(),
      medicineName: z.string(),
      batchNo: z.string(),
      quantity: z.number().int(),
      unitPriceMinor: z.number().int(),
      lineTotalMinor: z.number().int(),
    }),
  ),
});
export type Dispense = z.infer<typeof dispenseSchema>;

// --- the safety check ------------------------------------------------------

export const allergyWarningSchema = z.object({
  medicineId: z.string().uuid(),
  medicineName: z.string(),
  /** The patient allergy this collided with. */
  substance: z.string(),
  severity: allergySeveritySchema,
  reaction: z.string().nullable(),
  matchedKeyword: z.string(),
});
export type AllergyWarning = z.infer<typeof allergyWarningSchema>;

/**
 * Does this medicine collide with anything the patient is allergic to?
 *
 * Deliberately blunt: case-insensitive substring matching, in both directions,
 * across the medicine's name, generic name and allergen keywords. It will
 * occasionally warn when it need not, which is the correct direction to be
 * wrong in. It is shared so the prescribing screen and the API agree on exactly
 * what counts as a collision.
 *
 * This is the gap that made the benchmarked product unsafe: it stored allergies
 * in a textarea that nothing ever read.
 */
export function matchAllergy(
  medicine: {
    name: string;
    genericName?: string | null;
    allergenKeywords?: readonly string[];
  },
  substance: string,
): string | null {
  const needle = substance.trim().toLowerCase();
  if (needle.length < 3) return null;

  const haystacks = [
    medicine.name,
    medicine.genericName ?? '',
    ...(medicine.allergenKeywords ?? []),
  ]
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);

  for (const hay of haystacks) {
    if (hay.includes(needle) || needle.includes(hay)) return hay;
  }
  return null;
}
