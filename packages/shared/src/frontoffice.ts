import { z } from 'zod';
import { booleanQuery, isoDateSchema, isoDateTimeSchema, phoneSchema } from './common.js';
import { patientSummarySchema } from './patient.js';

/**
 * Front office: the visitor book, the call log, the postal register and
 * complaints.
 *
 * These are the paper books a hospital reception already keeps, and the reason
 * to put them here is that they are the ones auditors and families ask about
 * later — "who visited bed 7 on Tuesday", "we phoned three times". None of it
 * is clinical, so none of it is on the Case; it is a record of the building.
 */

// --- visitors --------------------------------------------------------------

export const createVisitorSchema = z.object({
  name: z.string().trim().min(1).max(160),
  phone: phoneSchema.optional(),
  /** Who they came to see, when that person is a patient here. */
  patientId: z.string().uuid().optional(),
  /** Free text when they are visiting a department rather than a person. */
  visitingWhom: z.string().trim().max(160).optional(),
  purpose: z.string().trim().max(300).optional(),
  idCardLast4: z.string().trim().max(8).optional(),
  numberOfVisitors: z.number().int().min(1).max(50).optional(),
  arrivedAt: isoDateTimeSchema.optional(),
  note: z.string().trim().max(500).optional(),
});
export type CreateVisitorInput = z.infer<typeof createVisitorSchema>;

export const visitorSchema = z.object({
  id: z.string().uuid(),
  passNo: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  patient: patientSummarySchema.nullable(),
  visitingWhom: z.string().nullable(),
  purpose: z.string().nullable(),
  idCardLast4: z.string().nullable(),
  numberOfVisitors: z.number().int(),
  arrivedAt: isoDateTimeSchema,
  leftAt: isoDateTimeSchema.nullable(),
  note: z.string().nullable(),
  recordedBy: z.string().nullable(),
  /** True while they have not signed out — derived, never stored. */
  isInside: z.boolean(),
});
export type Visitor = z.infer<typeof visitorSchema>;

export const visitorListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  patientId: z.string().uuid().optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  /** Only people who have not signed out — the evacuation list. */
  insideOnly: booleanQuery.optional(),
});

// --- calls -----------------------------------------------------------------

export const callDirectionSchema = z.enum(['incoming', 'outgoing']);
export type CallDirection = z.infer<typeof callDirectionSchema>;

export const CALL_DIRECTION_LABELS: Record<CallDirection, string> = {
  incoming: 'Incoming',
  outgoing: 'Outgoing',
};

export const createPhoneCallSchema = z.object({
  direction: callDirectionSchema,
  callerName: z.string().trim().min(1).max(160),
  phone: phoneSchema.optional(),
  patientId: z.string().uuid().optional(),
  purpose: z.string().trim().max(300).optional(),
  calledAt: isoDateTimeSchema.optional(),
  durationMinutes: z.number().int().min(0).max(600).optional(),
  /** What the caller was told, or what still needs doing. */
  outcome: z.string().trim().max(500).optional(),
  followUpOn: isoDateSchema.optional(),
  note: z.string().trim().max(500).optional(),
});
export type CreatePhoneCallInput = z.infer<typeof createPhoneCallSchema>;

export const phoneCallSchema = z.object({
  id: z.string().uuid(),
  direction: callDirectionSchema,
  callerName: z.string(),
  phone: z.string().nullable(),
  patient: patientSummarySchema.nullable(),
  purpose: z.string().nullable(),
  calledAt: isoDateTimeSchema,
  durationMinutes: z.number().int().nullable(),
  outcome: z.string().nullable(),
  followUpOn: isoDateSchema.nullable(),
  note: z.string().nullable(),
  recordedBy: z.string().nullable(),
});
export type PhoneCall = z.infer<typeof phoneCallSchema>;

export const phoneCallListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  direction: callDirectionSchema.optional(),
  patientId: z.string().uuid().optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  /** Calls with a follow-up date that has arrived. */
  dueOnly: booleanQuery.optional(),
});

// --- postal ----------------------------------------------------------------

export const postalDirectionSchema = z.enum(['received', 'dispatched']);
export type PostalDirection = z.infer<typeof postalDirectionSchema>;

export const POSTAL_DIRECTION_LABELS: Record<PostalDirection, string> = {
  received: 'Received',
  dispatched: 'Dispatched',
};

export const createPostalItemSchema = z.object({
  direction: postalDirectionSchema,
  /** Whoever it came from, or is going to. */
  party: z.string().trim().min(1).max(160),
  /** The department or person it is for. */
  addressedTo: z.string().trim().max(160).optional(),
  reference: z.string().trim().max(80).optional(),
  courier: z.string().trim().max(80).optional(),
  trackingNo: z.string().trim().max(80).optional(),
  onDate: isoDateSchema,
  note: z.string().trim().max(500).optional(),
});
export type CreatePostalItemInput = z.infer<typeof createPostalItemSchema>;

export const postalItemSchema = z.object({
  id: z.string().uuid(),
  direction: postalDirectionSchema,
  party: z.string(),
  addressedTo: z.string().nullable(),
  reference: z.string().nullable(),
  courier: z.string().nullable(),
  trackingNo: z.string().nullable(),
  onDate: isoDateSchema,
  note: z.string().nullable(),
  recordedBy: z.string().nullable(),
});
export type PostalItem = z.infer<typeof postalItemSchema>;

export const postalListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  direction: postalDirectionSchema.optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

// --- complaints ------------------------------------------------------------

export const complaintStatusSchema = z.enum([
  'open',
  'in_progress',
  'resolved',
  'closed',
]);
export type ComplaintStatus = z.infer<typeof complaintStatusSchema>;

export const COMPLAINT_STATUS_LABELS: Record<ComplaintStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  closed: 'Closed',
};

export const complaintSeveritySchema = z.enum(['low', 'medium', 'high']);
export type ComplaintSeverity = z.infer<typeof complaintSeveritySchema>;

export const COMPLAINT_SEVERITY_LABELS: Record<ComplaintSeverity, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
};

export const createComplaintSchema = z.object({
  complainantName: z.string().trim().min(1).max(160),
  phone: phoneSchema.optional(),
  patientId: z.string().uuid().optional(),
  /** Which part of the hospital it is about. */
  about: z.string().trim().max(160).optional(),
  severity: complaintSeveritySchema,
  description: z.string().trim().min(2).max(2000),
  receivedAt: isoDateTimeSchema.optional(),
  assignedToId: z.string().uuid().optional(),
});
export type CreateComplaintInput = z.infer<typeof createComplaintSchema>;

export const updateComplaintSchema = z.object({
  status: complaintStatusSchema.optional(),
  severity: complaintSeveritySchema.optional(),
  assignedToId: z.string().uuid().nullish(),
  /** What was done. Required to move a complaint to resolved. */
  resolution: z.string().trim().max(2000).nullish(),
  about: z.string().trim().max(160).nullish(),
});
export type UpdateComplaintInput = z.infer<typeof updateComplaintSchema>;

export const complaintSchema = z.object({
  id: z.string().uuid(),
  reference: z.string(),
  complainantName: z.string(),
  phone: z.string().nullable(),
  patient: patientSummarySchema.nullable(),
  about: z.string().nullable(),
  severity: complaintSeveritySchema,
  description: z.string(),
  status: complaintStatusSchema,
  assignedTo: z.string().nullable(),
  resolution: z.string().nullable(),
  receivedAt: isoDateTimeSchema,
  resolvedAt: isoDateTimeSchema.nullable(),
  recordedBy: z.string().nullable(),
  /** Whole days the complaint has been open. What a review actually looks at. */
  ageDays: z.number().int(),
});
export type Complaint = z.infer<typeof complaintSchema>;

export const complaintListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: complaintStatusSchema.optional(),
  severity: complaintSeveritySchema.optional(),
  patientId: z.string().uuid().optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  openOnly: booleanQuery.optional(),
});

/** A complaint is only settled once somebody wrote down what was done. */
export function requiresResolution(status: ComplaintStatus): boolean {
  return status === 'resolved' || status === 'closed';
}

/** Whole days a complaint has been open. Shared so the list and any report agree. */
export function complaintAgeDays(
  receivedAt: string,
  resolvedAt: string | null | undefined,
  now: string,
): number {
  const start = new Date(receivedAt).getTime();
  const end = new Date(resolvedAt ?? now).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.floor((end - start) / 86_400_000);
}
