import { z } from 'zod';
import { isoDateTimeSchema } from './common.js';
import { patientSummarySchema } from './patient.js';
import { serviceDepartmentSchema } from './services.js';
import { vitalFlagSchema } from './vitals.js';

/**
 * Diagnostics: the test catalogue and the reports produced against it.
 *
 * A report deliberately has NO status of its own — the ServiceOrder it belongs
 * to carries the single work state, and `reportedAt` says whether a result
 * exists. Two statuses on one piece of work is how a worklist starts
 * disagreeing with itself.
 */

// --- catalogue -------------------------------------------------------------

export const labTestParameterInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  unit: z.string().trim().max(30).optional(),
  /** Numeric range for flagging. Leave both out to never flag this parameter. */
  refLow: z.number().optional(),
  refHigh: z.number().optional(),
  /** Where a range is not numeric — "Negative", "Straw coloured". */
  refText: z.string().trim().max(120).optional(),
});
export type LabTestParameterInput = z.infer<typeof labTestParameterInputSchema>;

export const labTestParameterSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  unit: z.string().nullable(),
  refLow: z.number().nullable(),
  refHigh: z.number().nullable(),
  refText: z.string().nullable(),
  sortOrder: z.number().int(),
});
export type LabTestParameter = z.infer<typeof labTestParameterSchema>;

export const createLabTestSchema = z.object({
  name: z.string().trim().min(1).max(160),
  department: serviceDepartmentSchema,
  /** The billable service this defines. One service, at most one definition. */
  serviceId: z.string().uuid().optional(),
  sampleType: z.string().trim().max(60).optional(),
  method: z.string().trim().max(120).optional(),
  /** Ordered as given; imaging tests usually have none. */
  parameters: z.array(labTestParameterInputSchema).max(60).optional(),
});
export type CreateLabTestInput = z.infer<typeof createLabTestSchema>;

export const updateLabTestSchema = createLabTestSchema.partial().extend({
  serviceId: z.string().uuid().nullish(),
  sampleType: z.string().trim().max(60).nullish(),
  method: z.string().trim().max(120).nullish(),
  isActive: z.boolean().optional(),
});
export type UpdateLabTestInput = z.infer<typeof updateLabTestSchema>;

export const labTestSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  department: serviceDepartmentSchema,
  serviceId: z.string().uuid().nullable(),
  serviceName: z.string().nullable(),
  sampleType: z.string().nullable(),
  method: z.string().nullable(),
  isActive: z.boolean(),
  parameters: z.array(labTestParameterSchema),
});
export type LabTest = z.infer<typeof labTestSchema>;

export const labTestListQuerySchema = z.object({
  department: serviceDepartmentSchema.optional(),
  q: z.string().trim().max(120).optional(),
  includeInactive: z.coerce.boolean().optional(),
});

// --- collecting and reporting ----------------------------------------------

export const collectSampleSchema = z.object({
  collectedAt: isoDateTimeSchema.optional(),
});

const diagnosticValueInputSchema = z.object({
  parameterId: z.string().uuid().optional(),
  /** Required when no `parameterId` — a one-off line on the report. */
  name: z.string().trim().min(1).max(120).optional(),
  unit: z.string().trim().max(30).optional(),
  /** Numeric where the parameter is numeric; free text otherwise. */
  valueNumber: z.number().optional(),
  valueText: z.string().trim().max(500).optional(),
});

/**
 * Save the result. Values replace the whole set — simpler than per-row edits and
 * it matches how a technician actually works, filling in one form.
 */
export const saveDiagnosticReportSchema = z.object({
  values: z.array(diagnosticValueInputSchema).max(80).optional(),
  findings: z.string().trim().max(8000).optional(),
  impression: z.string().trim().max(4000).optional(),
  comments: z.string().trim().max(2000).optional(),
  /** Mark the report final. Leave false to save a draft and come back. */
  finalise: z.boolean().optional(),
});
export type SaveDiagnosticReportInput = z.infer<
  typeof saveDiagnosticReportSchema
>;

export const diagnosticValueSchema = z.object({
  id: z.string().uuid(),
  parameterId: z.string().uuid().nullable(),
  name: z.string(),
  unit: z.string().nullable(),
  valueText: z.string().nullable(),
  valueNumber: z.number().nullable(),
  flag: vitalFlagSchema.nullable(),
  refLow: z.number().nullable(),
  refHigh: z.number().nullable(),
  refText: z.string().nullable(),
  sortOrder: z.number().int(),
});
export type DiagnosticValue = z.infer<typeof diagnosticValueSchema>;

export const diagnosticReportSchema = z.object({
  id: z.string().uuid(),
  serviceOrderId: z.string().uuid(),
  department: serviceDepartmentSchema,
  patient: patientSummarySchema,
  caseId: z.string().uuid(),
  caseNo: z.string(),

  serviceName: z.string(),
  labTestId: z.string().uuid().nullable(),
  sampleType: z.string().nullable(),
  method: z.string().nullable(),

  sampleCollectedAt: isoDateTimeSchema.nullable(),
  findings: z.string().nullable(),
  impression: z.string().nullable(),
  comments: z.string().nullable(),
  reportedAt: isoDateTimeSchema.nullable(),
  reportedBy: z.string().nullable(),

  values: z.array(diagnosticValueSchema),
  /** True once `reportedAt` is set — the report has been handed over. */
  isFinal: z.boolean(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type DiagnosticReport = z.infer<typeof diagnosticReportSchema>;

export const diagnosticReportListQuerySchema = z.object({
  department: serviceDepartmentSchema.optional(),
  patientId: z.string().uuid().optional(),
  caseId: z.string().uuid().optional(),
  /** Only reports that are still open, i.e. not yet finalised. */
  pendingOnly: z.coerce.boolean().optional(),
  q: z.string().trim().max(120).optional(),
});

/**
 * Flag a numeric result against its reference range. Shared so the technician's
 * screen and the printed report can never disagree about what counts as high.
 */
export function flagValue(
  value: number | null | undefined,
  refLow: number | null | undefined,
  refHigh: number | null | undefined,
): 'low' | 'normal' | 'high' | null {
  if (value == null) return null;
  if (refLow == null && refHigh == null) return null;
  if (refLow != null && value < refLow) return 'low';
  if (refHigh != null && value > refHigh) return 'high';
  return 'normal';
}
