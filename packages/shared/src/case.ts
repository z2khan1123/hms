import { z } from 'zod';
import { isoDateSchema, isoDateTimeSchema } from './common.js';
import { patientSummarySchema } from './patient.js';

export const caseStatusSchema = z.enum(['open', 'closed', 'moved_to_ipd']);
export type CaseStatus = z.infer<typeof caseStatusSchema>;

export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  open: 'Open',
  closed: 'Closed',
  moved_to_ipd: 'Moved to IPD',
};

export const openCaseSchema = z.object({
  patientId: z.string().uuid(),
  isCasualty: z.boolean().optional(),
  reference: z.string().trim().max(160).optional(),
});
export type OpenCaseInput = z.infer<typeof openCaseSchema>;

export const closeCaseSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

export const caseBalanceSchema = z.object({
  chargedMinor: z.number().int(),
  paidMinor: z.number().int(),
  balanceMinor: z.number().int(),
});
export type CaseBalanceDto = z.infer<typeof caseBalanceSchema>;

export const caseSchema = z.object({
  id: z.string().uuid(),
  caseNo: z.string(),
  status: caseStatusSchema,
  openedAt: isoDateTimeSchema,
  closedAt: isoDateTimeSchema.nullable(),
  isCasualty: z.boolean(),
  reference: z.string().nullable(),
  patient: patientSummarySchema,
  visitCount: z.number().int(),
  balance: caseBalanceSchema,
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type Case = z.infer<typeof caseSchema>;

export const caseListQuerySchema = z.object({
  patientId: z.string().uuid().optional(),
  status: caseStatusSchema.optional(),
  q: z.string().trim().max(120).optional(),
});
