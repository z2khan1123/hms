import { z } from 'zod';
import { isoDateTimeSchema } from './common.js';

/**
 * Offline tolerance for the front desk.
 *
 * A hospital reception does not stop when the link does. The desk keeps taking
 * registrations, charges and vitals on paper today; the point of this is that
 * it keeps taking them in the software instead, and they arrive when the
 * connection does.
 *
 * The hard part is not the queue — it is making a replay safe. A request that
 * timed out may or may not have been applied, and a desk that presses the
 * button again must not create a second patient. So every queued operation
 * carries an idempotency key, and the server remembers what it answered.
 */

export const IDEMPOTENCY_HEADER = 'idempotency-key';

/** A client-generated key. A UUID is what `crypto.randomUUID()` gives us. */
export const idempotencyKeySchema = z.string().uuid();

/**
 * What the desk can do while offline.
 *
 * A closed list, and a short one. Everything here is a CREATE that the desk
 * owns end to end — nothing that needs to read fresh server state to be
 * correct. Queuing "issue this blood unit" offline would be queuing a decision
 * made against a stock level that may have changed, which is worse than
 * refusing.
 */
export const offlineOperationSchema = z.enum([
  'patient.create',
  'opd.visit.create',
  'vitals.record',
  'payment.create',
]);
export type OfflineOperation = z.infer<typeof offlineOperationSchema>;

export const OFFLINE_OPERATION_LABELS: Record<OfflineOperation, string> = {
  'patient.create': 'Register patient',
  'opd.visit.create': 'Open OPD visit',
  'vitals.record': 'Record vitals',
  'payment.create': 'Take payment',
};

export const outboxStatusSchema = z.enum([
  'queued',
  'sending',
  'sent',
  'failed',
  'rejected',
]);
export type OutboxStatus = z.infer<typeof outboxStatusSchema>;

export const OUTBOX_STATUS_LABELS: Record<OutboxStatus, string> = {
  queued: 'Waiting to send',
  sending: 'Sending',
  sent: 'Sent',
  failed: 'Will retry',
  rejected: 'Needs attention',
};

/**
 * One queued piece of work, as it lives in the browser.
 *
 * `key` is generated once, when the desk presses the button, and never changes
 * — that is the whole mechanism. Re-generating it on retry would defeat it.
 */
export const outboxEntrySchema = z.object({
  key: idempotencyKeySchema,
  operation: offlineOperationSchema,
  method: z.enum(['POST']),
  path: z.string().min(1).max(300),
  body: z.record(z.unknown()),
  /** What to show the operator, so a queue is readable without decoding JSON. */
  summary: z.string().max(200),
  status: outboxStatusSchema,
  attempts: z.number().int().min(0),
  createdAt: isoDateTimeSchema,
  lastAttemptAt: isoDateTimeSchema.nullable(),
  /** Why it will not go, when it will not go. */
  error: z.string().nullable(),
});
export type OutboxEntry = z.infer<typeof outboxEntrySchema>;

/** How long to wait before trying a failed item again. */
export function outboxRetryDelayMs(attempt: number): number {
  // 2s, 8s, 32s, 2m8s, then every ~4 minutes.
  return Math.min(2000 * 4 ** Math.max(0, attempt - 1), 256_000);
}

/**
 * Is this failure worth retrying?
 *
 * A 4xx means the request itself is wrong — retrying it forever just fills the
 * queue with something a person has to look at anyway. A 5xx or a network
 * failure is the server's problem or the line's, and will very likely work
 * later.
 */
export function isRetryable(status: number | null): boolean {
  if (status === null) return true; // no response at all: the network
  if (status === 408 || status === 429) return true;
  return status >= 500;
}

export const outboxSummarySchema = z.object({
  queued: z.number().int(),
  failed: z.number().int(),
  rejected: z.number().int(),
  oldestQueuedAt: isoDateTimeSchema.nullable(),
});
export type OutboxSummary = z.infer<typeof outboxSummarySchema>;
