import { z } from 'zod';
import { isoDateTimeSchema } from './common.js';
import { patientSummarySchema } from './patient.js';
import { practitionerSchema } from './practitioner.js';
import { caseBalanceSchema } from './case.js';

export const opdVisitStatusSchema = z.enum([
  'waiting',
  'in_consultation',
  'completed',
  'cancelled',
]);
export type OpdVisitStatus = z.infer<typeof opdVisitStatusSchema>;

export const OPD_STATUS_LABELS: Record<OpdVisitStatus, string> = {
  waiting: 'Waiting',
  in_consultation: 'In consultation',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

// --- clinical vocabulary ---------------------------------------------------

export const symptomTypeSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
});

export const symptomSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  symptomType: symptomTypeSchema,
});
export type Symptom = z.infer<typeof symptomSchema>;

export const findingSchema = z.object({
  id: z.string().uuid(),
  title: z.string(),
  description: z.string().nullable(),
  category: z.string().nullable(),
});
export type Finding = z.infer<typeof findingSchema>;

export const icd10CodeSchema = z.object({
  id: z.string().uuid(),
  code: z.string(),
  title: z.string(),
  group: z.object({ id: z.string().uuid(), name: z.string() }),
});
export type Icd10Code = z.infer<typeof icd10CodeSchema>;

// --- visit sub-records -----------------------------------------------------

const visitSymptomInput = z.object({
  symptomId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(200),
  detail: z.string().trim().max(2000).optional(),
});

const visitFindingInput = z.object({
  findingId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(200),
  detail: z.string().trim().max(2000).optional(),
});

const visitDiagnosisInput = z.object({
  icd10CodeId: z.string().uuid(),
  isPrimary: z.boolean().optional(),
  note: z.string().trim().max(500).optional(),
});

export const visitSymptomSchema = visitSymptomInput.extend({
  id: z.string().uuid(),
  detail: z.string().nullable(),
  symptomId: z.string().uuid().nullable(),
});
export const visitFindingSchema = visitFindingInput.extend({
  id: z.string().uuid(),
  detail: z.string().nullable(),
  findingId: z.string().uuid().nullable(),
});
export const visitDiagnosisSchema = z.object({
  id: z.string().uuid(),
  isPrimary: z.boolean(),
  note: z.string().nullable(),
  icd10Code: icd10CodeSchema,
});

// --- register a visit ------------------------------------------------------

/**
 * The front-desk registration payload. Either attach to an existing open case
 * (`caseId`) or let the API open a new one for the patient.
 */
export const createOpdVisitSchema = z.object({
  patientId: z.string().uuid(),
  caseId: z.string().uuid().optional(),
  practitionerId: z.string().uuid(),
  appointmentId: z.string().uuid().optional(),
  visitAt: isoDateTimeSchema,

  isFollowUp: z.boolean().optional(),
  isAntenatal: z.boolean().optional(),
  isLiveConsult: z.boolean().optional(),
  isCasualty: z.boolean().optional(),
  reference: z.string().trim().max(160).optional(),

  note: z.string().trim().max(2000).optional(),
  previousMedicalIssue: z.string().trim().max(2000).optional(),
  knownAllergies: z.string().trim().max(2000).optional(),

  symptoms: z.array(visitSymptomInput).max(30).optional(),

  /** Optional consultation charge billed at registration. */
  charge: z
    .object({
      chargeId: z.string().uuid(),
      appliedChargeMinor: z.number().int().min(0),
      quantity: z.number().int().min(1).max(999).optional(),
      discountBps: z.number().int().min(0).max(10_000).optional(),
      discountMinor: z.number().int().min(0).optional(),
      taxBps: z.number().int().min(0).max(100_000).optional(),
    })
    .optional(),

  /** Optional payment taken at registration. */
  payment: z
    .object({
      amountMinor: z.number().int().min(1),
      mode: z.enum(['cash', 'cheque', 'bank_transfer', 'card', 'online', 'other']),
      note: z.string().trim().max(500).optional(),
      chequeNo: z.string().trim().max(60).optional(),
      chequeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    })
    .optional(),
});
export type CreateOpdVisitInput = z.infer<typeof createOpdVisitSchema>;

/** The consultation itself — what the doctor records. */
export const updateOpdVisitSchema = z.object({
  practitionerId: z.string().uuid().optional(),
  note: z.string().trim().max(2000).optional(),
  previousMedicalIssue: z.string().trim().max(2000).optional(),
  knownAllergies: z.string().trim().max(2000).optional(),
  symptoms: z.array(visitSymptomInput).max(30).optional(),
  findings: z.array(visitFindingInput).max(30).optional(),
  diagnoses: z.array(visitDiagnosisInput).max(20).optional(),
});
export type UpdateOpdVisitInput = z.infer<typeof updateOpdVisitSchema>;

export const setOpdVisitStatusSchema = z.object({
  status: opdVisitStatusSchema,
  reason: z.string().trim().max(500).optional(),
});

// --- read models -----------------------------------------------------------

export const opdVisitListItemSchema = z.object({
  id: z.string().uuid(),
  opdNo: z.string(),
  visitAt: isoDateTimeSchema,
  status: opdVisitStatusSchema,
  isFollowUp: z.boolean(),
  isAntenatal: z.boolean(),
  patient: patientSummarySchema,
  practitioner: practitionerSchema,
  caseId: z.string().uuid(),
  caseNo: z.string(),
  netChargedMinor: z.number().int(),
  paidMinor: z.number().int(),
  balanceMinor: z.number().int(),
});
export type OpdVisitListItem = z.infer<typeof opdVisitListItemSchema>;

export const opdVisitSchema = opdVisitListItemSchema.extend({
  isLiveConsult: z.boolean(),
  reference: z.string().nullable(),
  note: z.string().nullable(),
  previousMedicalIssue: z.string().nullable(),
  knownAllergies: z.string().nullable(),
  symptoms: z.array(visitSymptomSchema),
  findings: z.array(visitFindingSchema),
  diagnoses: z.array(visitDiagnosisSchema),
  caseBalance: caseBalanceSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type OpdVisit = z.infer<typeof opdVisitSchema>;

/** Today / Upcoming / Old, the three views a front desk actually uses. */
export const opdScopeSchema = z.enum(['today', 'upcoming', 'past', 'all']);
export type OpdScope = z.infer<typeof opdScopeSchema>;

export const opdListQuerySchema = z.object({
  scope: opdScopeSchema.default('today'),
  practitionerId: z.string().uuid().optional(),
  patientId: z.string().uuid().optional(),
  caseId: z.string().uuid().optional(),
  status: opdVisitStatusSchema.optional(),
  q: z.string().trim().max(120).optional(),
});
