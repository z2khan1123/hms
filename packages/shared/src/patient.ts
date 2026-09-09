import { z } from 'zod';
import { addressSchema, isoDateSchema, phoneSchema } from './common.js';

/** FHIR administrative-gender. */
export const genderSchema = z.enum(['male', 'female', 'other', 'unknown']);
export type Gender = z.infer<typeof genderSchema>;

export const patientStatusSchema = z.enum(['active', 'inactive', 'deceased']);
export type PatientStatus = z.infer<typeof patientStatusSchema>;

export const maritalStatusSchema = z.enum([
  'single',
  'married',
  'widowed',
  'separated',
  'not_specified',
]);
export type MaritalStatus = z.infer<typeof maritalStatusSchema>;

export const BLOOD_TYPES = [
  'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-',
] as const;
export const bloodTypeSchema = z.enum(BLOOD_TYPES);

/** CNIC — 13 digits, conventionally written 35202-1234567-1. */
export const cnicSchema = z
  .string()
  .trim()
  .regex(/^\d{5}-?\d{7}-?\d$/, 'CNIC must be 13 digits, e.g. 35202-1234567-1');

export const createPatientSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  guardianName: z.string().trim().max(150).optional(),
  gender: genderSchema,
  birthDate: isoDateSchema,
  maritalStatus: maritalStatusSchema.optional(),
  bloodType: bloodTypeSchema.optional(),

  phone: phoneSchema,
  alternatePhone: phoneSchema.optional(),
  email: z.string().trim().email().max(254).optional(),
  address: addressSchema.optional(),

  /** Optional; the API stores only a salted hash plus the last 4 digits. */
  nationalId: cnicSchema.optional(),

  photoUrl: z.string().trim().url().max(2048).optional(),
  remarks: z.string().trim().max(2000).optional(),
});
export type CreatePatientInput = z.infer<typeof createPatientSchema>;

/**
 * Everything a doctor or an administrator can change later. Deliberately wider
 * than registration: allergies are a CLINICAL fact a receptionist cannot know,
 * and payer membership is paperwork that arrives after the patient is in the
 * building. Neither belongs on the front-desk form.
 */
export const updatePatientSchema = createPatientSchema.partial().extend({
  status: patientStatusSchema.optional(),
  /** Recorded by the doctor at consultation, not at the desk. */
  knownAllergies: z.string().trim().max(2000).nullish(),
});
export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;

/**
 * The allergy note on its own.
 *
 * A doctor recording an allergy is doing something clinical, and must not need
 * the right to rename the patient in order to do it.
 */
export const setKnownAllergiesSchema = z.object({
  knownAllergies: z.string().trim().max(2000).nullable(),
});
export type SetKnownAllergiesInput = z.infer<typeof setKnownAllergiesSchema>;

export const patientSchema = z.object({
  id: z.string().uuid(),
  mrn: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  guardianName: z.string().nullable(),
  gender: genderSchema,
  birthDate: isoDateSchema,
  maritalStatus: maritalStatusSchema.nullable(),
  bloodType: z.string().nullable(),

  phone: z.string(),
  alternatePhone: z.string().nullable(),
  email: z.string().nullable(),
  address: addressSchema.nullable(),

  nationalIdLast4: z.string().nullable(),

  photoUrl: z.string().nullable(),
  knownAllergies: z.string().nullable(),
  remarks: z.string().nullable(),

  status: patientStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Patient = z.infer<typeof patientSchema>;

/** Compact shape for pickers, search results and headers. */
export const patientSummarySchema = z.object({
  id: z.string().uuid(),
  mrn: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  gender: genderSchema,
  birthDate: isoDateSchema,
  phone: z.string(),
  /** Father's or guardian's name — an identifier here, not a demographic. */
  guardianName: z.string().nullable(),
  knownAllergies: z.string().nullable(),
});
export type PatientSummary = z.infer<typeof patientSummarySchema>;

export const patientSearchQuerySchema = z.object({
  /** Matches name, MRN, phone or CNIC last-4. */
  q: z.string().trim().max(120).optional(),
  status: patientStatusSchema.optional(),
});

/** Years / months / days, the way registration desks state a patient's age. */
export function ageParts(birthDate: string, now = new Date()): {
  years: number;
  months: number;
  days: number;
} {
  const dob = new Date(`${birthDate}T00:00:00Z`);
  let years = now.getUTCFullYear() - dob.getUTCFullYear();
  let months = now.getUTCMonth() - dob.getUTCMonth();
  let days = now.getUTCDate() - dob.getUTCDate();

  if (days < 0) {
    months -= 1;
    days += new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0)).getUTCDate();
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }
  return { years: Math.max(0, years), months: Math.max(0, months), days: Math.max(0, days) };
}

export function formatAge(birthDate: string, now = new Date()): string {
  const { years, months, days } = ageParts(birthDate, now);
  if (years > 0) return `${years}y ${months}m`;
  if (months > 0) return `${months}m ${days}d`;
  return `${days}d`;
}

/**
 * What a doctor is shown when a returning patient reaches him. The front desk
 * cannot know a patient is allergic — the doctor who diagnosed it did, on an
 * earlier visit — so the record has to carry that forward and put it in front
 * of the next doctor rather than hoping he opens the right tab.
 */
export const patientHistoryAlertSchema = z.object({
  /** False for a genuinely new patient — the client shows nothing. */
  hasHistory: z.boolean(),
  knownAllergies: z.string().nullable(),
  /** When the allergy note was last changed, so the doctor can judge its age. */
  allergiesUpdatedAt: z.string().nullable(),
  previousVisitCount: z.number().int(),
  lastVisitAt: z.string().nullable(),
  lastVisitPractitioner: z.string().nullable(),
  recentDiagnoses: z.array(
    z.object({
      code: z.string(),
      title: z.string(),
      recordedAt: z.string(),
    }),
  ),
  previousAdmissionCount: z.number().int(),
});
export type PatientHistoryAlert = z.infer<typeof patientHistoryAlertSchema>;
