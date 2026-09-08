import { z } from 'zod';
import { booleanQuery, isoDateTimeSchema } from './common.js';
import { PERMISSIONS } from './rbac.js';

/**
 * The integration surface: API keys and outbound webhooks.
 *
 * The benchmarked product has no API at all, so anything a hospital wants to
 * connect — a lab analyser, an insurer, their own website — is a person
 * retyping. This is the part that stops being true.
 *
 * Two rules shape everything here. A secret is shown once and stored only as a
 * hash, so a leaked database does not hand over working credentials. And an
 * API key carries explicit SCOPES rather than a role: a key cannot quietly gain
 * new powers because somebody widened a role six months later.
 */

// --- API keys --------------------------------------------------------------

/** Keys are `hms_<prefix>_<secret>`. The prefix is a lookup handle, not a secret. */
export const API_KEY_PREFIX = 'hms';

/**
 * Split a presented key into its lookup handle and its secret.
 *
 * Parsed by position rather than by splitting on `_`, because the secret is
 * base64url and that alphabet CONTAINS underscores. Splitting produced four
 * parts for roughly half of all generated keys and rejected them as malformed
 * — which looked exactly like an authentication failure, and was not.
 */
export function parseApiKey(
  raw: string,
): { prefix: string; secret: string } | null {
  const value = raw.trim();
  const first = value.indexOf('_');
  if (first <= 0) return null;
  if (value.slice(0, first) !== API_KEY_PREFIX) return null;

  const second = value.indexOf('_', first + 1);
  if (second <= first + 1) return null;

  const handle = value.slice(first + 1, second);
  const secret = value.slice(second + 1);
  if (!handle || !secret) return null;

  return { prefix: `${API_KEY_PREFIX}_${handle}`, secret };
}

export const createApiKeySchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(400).optional(),
  /**
   * Exactly what this key may do. Never inherited from a role — a key issued
   * to read lab results must not start writing prescriptions because somebody
   * widened the pathologist role later.
   */
  scopes: z.array(z.enum(PERMISSIONS)).min(1).max(100),
  /** Keys that never expire are the ones still working after someone leaves. */
  expiresAt: isoDateTimeSchema.optional(),
});
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;

export const updateApiKeySchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(400).nullish(),
  scopes: z.array(z.enum(PERMISSIONS)).min(1).max(100).optional(),
  expiresAt: isoDateTimeSchema.nullish(),
});
export type UpdateApiKeyInput = z.infer<typeof updateApiKeySchema>;

export const apiKeySchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  description: z.string().nullable(),
  /** The visible half, e.g. `hms_a1b2c3d4`. Enough to identify, useless alone. */
  prefix: z.string(),
  scopes: z.array(z.enum(PERMISSIONS)),
  lastUsedAt: isoDateTimeSchema.nullable(),
  expiresAt: isoDateTimeSchema.nullable(),
  revokedAt: isoDateTimeSchema.nullable(),
  createdBy: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  /** Derived: usable right now. Revoked and expired are both dead. */
  isActive: z.boolean(),
});
export type ApiKey = z.infer<typeof apiKeySchema>;

/**
 * The one and only time the secret exists outside a hash. If it is lost, the
 * key is rotated — there is no recovery, by design.
 */
export const apiKeyCreatedSchema = apiKeySchema.extend({
  secret: z.string(),
});
export type ApiKeyCreated = z.infer<typeof apiKeyCreatedSchema>;

export const apiKeyListQuerySchema = z.object({
  includeRevoked: booleanQuery.optional(),
});

/** Server and client must agree on whether a key still works. */
export function apiKeyIsActive(
  key: { revokedAt?: string | null; expiresAt?: string | null },
  now: string,
): boolean {
  if (key.revokedAt) return false;
  if (key.expiresAt && key.expiresAt <= now) return false;
  return true;
}

// --- webhooks --------------------------------------------------------------

/**
 * What a hospital's systems might want to hear about. Deliberately a closed
 * list: an open one becomes a promise to notify on everything, and then every
 * new column is a breaking change to somebody's integration.
 */
export const webhookEventSchema = z.enum([
  'patient.created',
  'patient.updated',
  'appointment.created',
  'appointment.cancelled',
  'opd.visit.created',
  'opd.visit.completed',
  'order.created',
  'report.finalised',
  'bill.item.created',
  'payment.received',
  'admission.created',
  'admission.discharged',
  'blood.issued',
  'birth.recorded',
  'death.recorded',
]);
export type WebhookEvent = z.infer<typeof webhookEventSchema>;

export const WEBHOOK_EVENTS = webhookEventSchema.options;

export const WEBHOOK_EVENT_LABELS: Record<WebhookEvent, string> = {
  'patient.created': 'Patient registered',
  'patient.updated': 'Patient details changed',
  'appointment.created': 'Appointment booked',
  'appointment.cancelled': 'Appointment cancelled',
  'opd.visit.created': 'OPD visit opened',
  'opd.visit.completed': 'OPD visit completed',
  'order.created': 'Test or procedure ordered',
  'report.finalised': 'Report finalised',
  'bill.item.created': 'Charge added',
  'payment.received': 'Payment received',
  'admission.created': 'Patient admitted',
  'admission.discharged': 'Patient discharged',
  'blood.issued': 'Blood issued',
  'birth.recorded': 'Birth recorded',
  'death.recorded': 'Death recorded',
};

export const createWebhookSchema = z.object({
  url: z.string().url().max(500).refine((u) => u.startsWith('https://'), {
    message: 'The endpoint must be https — we will not post patient data over http',
  }),
  description: z.string().trim().max(400).optional(),
  events: z.array(webhookEventSchema).min(1),
});
export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;

export const updateWebhookSchema = z.object({
  url: z
    .string()
    .url()
    .max(500)
    .refine((u) => u.startsWith('https://'), {
      message: 'The endpoint must be https — we will not post patient data over http',
    })
    .optional(),
  description: z.string().trim().max(400).nullish(),
  events: z.array(webhookEventSchema).min(1).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateWebhookInput = z.infer<typeof updateWebhookSchema>;

export const webhookSchema = z.object({
  id: z.string().uuid(),
  url: z.string(),
  description: z.string().nullable(),
  events: z.array(webhookEventSchema),
  isActive: z.boolean(),
  createdBy: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  /** Rolling health, derived from recent deliveries. */
  recentFailures: z.number().int(),
  lastDeliveryAt: isoDateTimeSchema.nullable(),
  lastDeliveryOk: z.boolean().nullable(),
});
export type Webhook = z.infer<typeof webhookSchema>;

/** The signing secret, shown once at creation exactly like an API key. */
export const webhookCreatedSchema = webhookSchema.extend({
  secret: z.string(),
});
export type WebhookCreated = z.infer<typeof webhookCreatedSchema>;

export const deliveryStatusSchema = z.enum([
  'pending',
  'delivered',
  'failed',
  'abandoned',
]);
export type DeliveryStatus = z.infer<typeof deliveryStatusSchema>;

export const DELIVERY_STATUS_LABELS: Record<DeliveryStatus, string> = {
  pending: 'Pending',
  delivered: 'Delivered',
  failed: 'Retrying',
  abandoned: 'Given up',
};

export const webhookDeliverySchema = z.object({
  id: z.string().uuid(),
  webhookId: z.string().uuid(),
  event: webhookEventSchema,
  status: deliveryStatusSchema,
  attempts: z.number().int(),
  responseStatus: z.number().int().nullable(),
  error: z.string().nullable(),
  createdAt: isoDateTimeSchema,
  lastAttemptAt: isoDateTimeSchema.nullable(),
  nextAttemptAt: isoDateTimeSchema.nullable(),
  deliveredAt: isoDateTimeSchema.nullable(),
});
export type WebhookDelivery = z.infer<typeof webhookDeliverySchema>;

export const deliveryListQuerySchema = z.object({
  webhookId: z.string().uuid().optional(),
  status: deliveryStatusSchema.optional(),
  event: webhookEventSchema.optional(),
});

/**
 * How many times to try before giving up, and how long to wait between tries.
 *
 * Exponential, so a receiver that is down for an hour is not hammered, and it
 * gives up rather than retrying for ever — an unbounded queue of undeliverable
 * events is how a webhook system quietly becomes a disk-space incident.
 */
export const MAX_DELIVERY_ATTEMPTS = 6;

export function retryDelaySeconds(attempt: number): number {
  // 30s, 2m, 8m, 32m, 2h8m — then abandoned.
  return 30 * 4 ** Math.max(0, attempt - 1);
}

export function nextAttemptAt(attempt: number, from: Date = new Date()): Date | null {
  if (attempt >= MAX_DELIVERY_ATTEMPTS) return null;
  return new Date(from.getTime() + retryDelaySeconds(attempt) * 1000);
}

/**
 * The signature header a receiver verifies.
 *
 * The timestamp is inside the signed string, not merely alongside it, so an
 * intercepted delivery cannot be replayed a week later with a fresh timestamp.
 * Receivers should reject anything older than a few minutes.
 */
export const SIGNATURE_HEADER = 'x-hms-signature';
export const TIMESTAMP_HEADER = 'x-hms-timestamp';
export const EVENT_HEADER = 'x-hms-event';
export const DELIVERY_HEADER = 'x-hms-delivery';

/** Exactly what gets signed: `<timestamp>.<raw body>`. */
export function signaturePayload(timestamp: string, body: string): string {
  return `${timestamp}.${body}`;
}
