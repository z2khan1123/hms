import { z } from 'zod';
import { isoDateSchema, isoDateTimeSchema, phoneSchema } from './common.js';
import { cnicSchema, genderSchema, patientSummarySchema } from './patient.js';

/**
 * The birth and death registers.
 *
 * In Pakistan the hospital does not register a birth or a death with the state.
 * It issues the source document, and the family takes that to the Union Council,
 * which registers it with NADRA. So these records are evidence: they need a
 * serial number, they need to print, and they need somewhere to record the
 * Union Council registration once it comes back — which can be months later.
 *
 * A death record also settles a fact the rest of the system depends on, so
 * recording one marks the patient deceased rather than leaving two places to
 * disagree about whether someone is alive.
 */

// --- births ----------------------------------------------------------------

export const deliveryTypeSchema = z.enum([
  'normal',
  'caesarean',
  'assisted',
  'other',
]);
export type DeliveryType = z.infer<typeof deliveryTypeSchema>;

export const DELIVERY_TYPE_LABELS: Record<DeliveryType, string> = {
  normal: 'Normal',
  caesarean: 'Caesarean',
  assisted: 'Assisted',
  other: 'Other',
};

export const createBirthRecordSchema = z.object({
  /**
   * Often blank. A family may not name a child for days, and the register must
   * not force an invented name onto a legal document.
   */
  childName: z.string().trim().max(160).optional(),
  gender: genderSchema,
  bornAt: isoDateTimeSchema,
  /** Grams. Recorded as an integer for the same reason money is. */
  birthWeightGrams: z.number().int().min(200).max(10_000).optional(),
  deliveryType: deliveryTypeSchema,

  /** The mother is normally a patient here; occasionally she is not. */
  motherPatientId: z.string().uuid().optional(),
  motherName: z.string().trim().max(160).optional(),
  motherCnic: cnicSchema.optional(),
  fatherName: z.string().trim().max(160).optional(),
  fatherCnic: cnicSchema.optional(),
  contactPhone: phoneSchema.optional(),
  address: z.string().trim().max(300).optional(),

  attendedById: z.string().uuid().optional(),
  /** If the newborn has been registered as a patient in their own right. */
  childPatientId: z.string().uuid().optional(),
  note: z.string().trim().max(1000).optional(),
});
export type CreateBirthRecordInput = z.infer<typeof createBirthRecordSchema>;

export const updateBirthRecordSchema = createBirthRecordSchema.partial().extend({
  childName: z.string().trim().max(160).nullish(),
  birthWeightGrams: z.number().int().min(200).max(10_000).nullish(),
  motherPatientId: z.string().uuid().nullish(),
  motherName: z.string().trim().max(160).nullish(),
  fatherName: z.string().trim().max(160).nullish(),
  contactPhone: phoneSchema.nullish(),
  address: z.string().trim().max(300).nullish(),
  attendedById: z.string().uuid().nullish(),
  childPatientId: z.string().uuid().nullish(),
  note: z.string().trim().max(1000).nullish(),
  /** Filled in when the Union Council registration comes back. */
  registrationNo: z.string().trim().max(80).nullish(),
  registeredOn: isoDateSchema.nullish(),
});
export type UpdateBirthRecordInput = z.infer<typeof updateBirthRecordSchema>;

export const birthRecordSchema = z.object({
  id: z.string().uuid(),
  /** The hospital's own serial. What the printed slip carries. */
  certificateNo: z.string(),
  childName: z.string().nullable(),
  gender: genderSchema,
  bornAt: isoDateTimeSchema,
  birthWeightGrams: z.number().int().nullable(),
  deliveryType: deliveryTypeSchema,

  mother: patientSummarySchema.nullable(),
  motherName: z.string().nullable(),
  motherCnicLast4: z.string().nullable(),
  fatherName: z.string().nullable(),
  fatherCnicLast4: z.string().nullable(),
  contactPhone: z.string().nullable(),
  address: z.string().nullable(),

  attendedBy: z.string().nullable(),
  childPatientId: z.string().uuid().nullable(),
  note: z.string().nullable(),

  /** The Union Council / NADRA registration, once the family reports it back. */
  registrationNo: z.string().nullable(),
  registeredOn: isoDateSchema.nullable(),
  /** True once a state registration number has been recorded. */
  isRegistered: z.boolean(),

  recordedBy: z.string().nullable(),
  createdAt: isoDateTimeSchema,
});
export type BirthRecord = z.infer<typeof birthRecordSchema>;

export const birthListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  gender: genderSchema.optional(),
  deliveryType: deliveryTypeSchema.optional(),
  /** Only records the family has not yet registered with the Union Council. */
  unregisteredOnly: z.union([z.boolean(), z.string()]).optional(),
});

/** The mother's name for display, whether she is a patient here or not. */
export function motherLabel(r: {
  mother: { firstName: string; lastName: string } | null;
  motherName: string | null;
}): string {
  if (r.mother) return `${r.mother.firstName} ${r.mother.lastName}`.trim();
  return r.motherName ?? '—';
}

// --- deaths ----------------------------------------------------------------

export const createDeathRecordSchema = z.object({
  /** A death record always names a patient — this is their record closing. */
  patientId: z.string().uuid(),
  diedAt: isoDateTimeSchema,
  /** Free text. Coding it to ICD-10 is a separate, later concern. */
  causeOfDeath: z.string().trim().min(2).max(500),
  /** Where it happened: a ward, the emergency room, brought in dead. */
  placeOfDeath: z.string().trim().max(160).optional(),
  certifiedById: z.string().uuid().optional(),
  informantName: z.string().trim().max(160).optional(),
  informantPhone: phoneSchema.optional(),
  informantRelation: z.string().trim().max(80).optional(),
  note: z.string().trim().max(1000).optional(),
});
export type CreateDeathRecordInput = z.infer<typeof createDeathRecordSchema>;

export const updateDeathRecordSchema = createDeathRecordSchema
  .omit({ patientId: true })
  .partial()
  .extend({
    placeOfDeath: z.string().trim().max(160).nullish(),
    certifiedById: z.string().uuid().nullish(),
    informantName: z.string().trim().max(160).nullish(),
    informantPhone: phoneSchema.nullish(),
    informantRelation: z.string().trim().max(80).nullish(),
    note: z.string().trim().max(1000).nullish(),
    registrationNo: z.string().trim().max(80).nullish(),
    registeredOn: isoDateSchema.nullish(),
  });
export type UpdateDeathRecordInput = z.infer<typeof updateDeathRecordSchema>;

export const deathRecordSchema = z.object({
  id: z.string().uuid(),
  certificateNo: z.string(),
  patient: patientSummarySchema,
  diedAt: isoDateTimeSchema,
  causeOfDeath: z.string(),
  placeOfDeath: z.string().nullable(),
  certifiedBy: z.string().nullable(),
  informantName: z.string().nullable(),
  informantPhone: z.string().nullable(),
  informantRelation: z.string().nullable(),
  note: z.string().nullable(),
  registrationNo: z.string().nullable(),
  registeredOn: isoDateSchema.nullable(),
  isRegistered: z.boolean(),
  recordedBy: z.string().nullable(),
  createdAt: isoDateTimeSchema,
});
export type DeathRecord = z.infer<typeof deathRecordSchema>;

export const deathListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  unregisteredOnly: z.union([z.boolean(), z.string()]).optional(),
});

/**
 * Recording the state registration. Shared between births and deaths because
 * the Union Council step is identical for both.
 */
export const recordRegistrationSchema = z.object({
  registrationNo: z.string().trim().min(1).max(80),
  registeredOn: isoDateSchema,
});
export type RecordRegistrationInput = z.infer<typeof recordRegistrationSchema>;
