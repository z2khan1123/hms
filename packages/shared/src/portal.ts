import { z } from 'zod';
import { isoDateSchema, isoDateTimeSchema, phoneSchema } from './common.js';

/**
 * The patient portal.
 *
 * A patient is NOT a staff user with fewer permissions. Giving them a role in
 * the staff RBAC table would put them one mistaken grant away from reading
 * somebody else's chart, and every future permission added to a shared role
 * would have to be audited against "but what if a patient holds this".
 *
 * So the portal is a separate surface with a separate credential and a
 * separate token type. It has no permissions at all: the only authority a
 * portal token carries is "you are this patient", and every query is scoped by
 * the patient id inside the token rather than by anything in the request.
 */

/** Marks a token as a portal token. A staff token has no such claim. */
export const PORTAL_TOKEN_TYPE = 'portal';

export const portalJwtPayloadSchema = z.object({
  sub: z.string().uuid(),
  typ: z.literal(PORTAL_TOKEN_TYPE),
  patientId: z.string().uuid(),
  tenantId: z.string().uuid(),
});
export type PortalJwtPayload = z.infer<typeof portalJwtPayloadSchema>;

// --- account -----------------------------------------------------------------

export const portalLoginSchema = z.object({
  /** The MRN, which the patient already has on every slip we hand them. */
  mrn: z.string().trim().min(1).max(40),
  password: z.string().min(1).max(128),
});
export type PortalLoginInput = z.infer<typeof portalLoginSchema>;

/**
 * Staff invite a patient rather than the patient self-registering. Anyone can
 * type an MRN, so self-registration would let a stranger claim a stranger's
 * record; a desk that has already seen the person is the check.
 */
export const invitePortalAccountSchema = z.object({
  patientId: z.string().uuid(),
  /** Where the one-time code goes. Optional — a desk may hand it over instead. */
  email: z.string().trim().email().max(254).optional(),
  phone: phoneSchema.optional(),
});
export type InvitePortalAccountInput = z.infer<typeof invitePortalAccountSchema>;

export const setPortalPasswordSchema = z
  .object({
    /** The one-time code from the invitation. */
    token: z.string().trim().min(10).max(200),
    password: z.string().min(10).max(128),
    confirm: z.string().min(10).max(128),
  })
  .refine((v) => v.password === v.confirm, {
    message: 'The two passwords do not match',
    path: ['confirm'],
  });
export type SetPortalPasswordInput = z.infer<typeof setPortalPasswordSchema>;

export const changePortalPasswordSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    password: z.string().min(10).max(128),
    confirm: z.string().min(10).max(128),
  })
  .refine((v) => v.password === v.confirm, {
    message: 'The two passwords do not match',
    path: ['confirm'],
  });
export type ChangePortalPasswordInput = z.infer<
  typeof changePortalPasswordSchema
>;

export const portalAccountSchema = z.object({
  id: z.string().uuid(),
  patientId: z.string().uuid(),
  mrn: z.string(),
  patientName: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  isActive: z.boolean(),
  /** False until they have set a password from their invitation. */
  hasPassword: z.boolean(),
  lastLoginAt: isoDateTimeSchema.nullable(),
  invitedAt: isoDateTimeSchema,
});
export type PortalAccount = z.infer<typeof portalAccountSchema>;

/** Returned once, when an account is invited. Never retrievable afterwards. */
export const portalInviteSchema = portalAccountSchema.extend({
  inviteToken: z.string(),
  inviteExpiresAt: isoDateTimeSchema,
});
export type PortalInvite = z.infer<typeof portalInviteSchema>;

export const portalSessionSchema = z.object({
  accessToken: z.string(),
  patient: z.object({
    id: z.string().uuid(),
    mrn: z.string(),
    firstName: z.string(),
    lastName: z.string(),
  }),
});
export type PortalSession = z.infer<typeof portalSessionSchema>;

// --- what a patient can see --------------------------------------------------

export const portalVisitSchema = z.object({
  id: z.string().uuid(),
  opdNo: z.string(),
  visitAt: isoDateTimeSchema,
  doctor: z.string().nullable(),
  status: z.string(),
  diagnoses: z.array(z.object({ code: z.string(), title: z.string() })),
});
export type PortalVisit = z.infer<typeof portalVisitSchema>;

export const portalPrescriptionSchema = z.object({
  id: z.string().uuid(),
  visitId: z.string().uuid(),
  prescribedAt: isoDateTimeSchema,
  doctor: z.string().nullable(),
  drugName: z.string(),
  dose: z.string().nullable(),
  frequency: z.string().nullable(),
  durationDays: z.number().int().nullable(),
  instructions: z.string().nullable(),
});
export type PortalPrescription = z.infer<typeof portalPrescriptionSchema>;

export const portalReportSchema = z.object({
  id: z.string().uuid(),
  serviceName: z.string(),
  department: z.string(),
  reportedAt: isoDateTimeSchema.nullable(),
  /**
   * Only finalised reports are ever listed. A patient reading a draft result
   * before a clinician has released it is how somebody learns they have cancer
   * from a web page at two in the morning.
   */
  isFinal: z.literal(true),
  impression: z.string().nullable(),
  values: z.array(
    z.object({
      name: z.string(),
      value: z.string(),
      unit: z.string().nullable(),
      flag: z.enum(['low', 'normal', 'high']).nullable(),
      referenceRange: z.string().nullable(),
    }),
  ),
});
export type PortalReport = z.infer<typeof portalReportSchema>;

export const portalBillSchema = z.object({
  caseId: z.string().uuid(),
  caseNo: z.string(),
  openedAt: isoDateTimeSchema,
  status: z.string(),
  /** The three figures `computeCaseBalance` defines. No others are invented. */
  chargedMinor: z.number().int(),
  paidMinor: z.number().int(),
  balanceMinor: z.number().int(),
  items: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      chargedAt: isoDateTimeSchema,
      quantity: z.number().int(),
      netMinor: z.number().int(),
      status: z.string(),
    }),
  ),
});
export type PortalBill = z.infer<typeof portalBillSchema>;

export const portalAppointmentSchema = z.object({
  id: z.string().uuid(),
  scheduledAt: isoDateTimeSchema,
  doctor: z.string().nullable(),
  status: z.string(),
  reason: z.string().nullable(),
});
export type PortalAppointment = z.infer<typeof portalAppointmentSchema>;

/**
 * A patient asks for an appointment; the desk confirms it. Letting the portal
 * write straight into the diary would let anyone fill a clinic overnight.
 */
export const requestAppointmentSchema = z.object({
  practitionerId: z.string().uuid().optional(),
  preferredDate: isoDateSchema,
  reason: z.string().trim().max(500).optional(),
});
export type RequestAppointmentInput = z.infer<typeof requestAppointmentSchema>;

export const portalSummarySchema = z.object({
  patient: z.object({
    id: z.string().uuid(),
    mrn: z.string(),
    firstName: z.string(),
    lastName: z.string(),
    birthDate: isoDateSchema,
    phone: z.string(),
  }),
  visitCount: z.number().int(),
  lastVisitAt: isoDateTimeSchema.nullable(),
  upcomingAppointments: z.number().int(),
  finalisedReports: z.number().int(),
  outstandingBalanceMinor: z.number().int(),
});
export type PortalSummary = z.infer<typeof portalSummarySchema>;
