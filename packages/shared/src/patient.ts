import { z } from 'zod';
import { addressSchema, phoneSchema } from './common.js';

/** FHIR administrative-gender. */
export const genderSchema = z.enum(['male', 'female', 'other', 'unknown']);
export type Gender = z.infer<typeof genderSchema>;

export const patientStatusSchema = z.enum(['active', 'inactive', 'deceased']);
export type PatientStatus = z.infer<typeof patientStatusSchema>;

export const bloodTypeSchema = z.enum([
  'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-',
]);

/** ISO date string, YYYY-MM-DD. */
const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected date as YYYY-MM-DD');

export const createPatientSchema = z.object({
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  gender: genderSchema,
  birthDate: isoDateSchema,
  phone: phoneSchema,
  email: z.string().trim().email().max(254).optional(),
  /** CNIC — optional; the API stores only a hash + last 4 digits. */
  nationalId: z
    .string()
    .trim()
    .regex(/^\d{5}-?\d{7}-?\d$/, 'CNIC must look like 35202-1234567-1')
    .optional(),
  address: addressSchema.optional(),
  bloodType: bloodTypeSchema.optional(),
});
export type CreatePatientInput = z.infer<typeof createPatientSchema>;

export const updatePatientSchema = createPatientSchema.partial().extend({
  status: patientStatusSchema.optional(),
});
export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;

export const patientSchema = z.object({
  id: z.string().uuid(),
  mrn: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  gender: genderSchema,
  birthDate: isoDateSchema,
  phone: z.string(),
  email: z.string().nullable(),
  nationalIdLast4: z.string().nullable(),
  address: addressSchema.nullable(),
  bloodType: z.string().nullable(),
  status: patientStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Patient = z.infer<typeof patientSchema>;

export const patientSearchQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
});
