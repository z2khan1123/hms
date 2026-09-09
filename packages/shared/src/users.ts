import { z } from 'zod';
import { booleanQuery } from './common.js';
import { PERMISSIONS, ROLES } from './rbac.js';

/**
 * Staff account administration.
 *
 * Distinct from `auth.ts`, which is about a person proving who they are. This
 * is about an administrator deciding who may exist and what they may do — and
 * it is the one part of the system where a mistake hands somebody else's
 * account away, so the rules below are deliberately narrow.
 */

export const userListQuerySchema = z.object({
  search: z.string().trim().max(120).optional(),
  role: z.enum(ROLES).optional(),
  includeInactive: booleanQuery.optional(),
});
export type UserListFilter = z.infer<typeof userListQuerySchema>;

export const userSummarySchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  firstName: z.string(),
  lastName: z.string(),
  role: z.enum(ROLES),
  isActive: z.boolean(),
  lastLoginAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  /** Set when this account is also a clinician who can be booked. */
  practitionerId: z.string().uuid().nullable(),
  /** Set when HR holds an employment record for this account. */
  staffNo: z.string().nullable(),
});
export type UserSummary = z.infer<typeof userSummarySchema>;

/**
 * A password an administrator sets on somebody else's behalf.
 *
 * Twelve characters, matching self-service registration. Length is the only
 * rule worth enforcing: composition rules push people towards `Password1!`
 * and towards writing it on the monitor, which is the threat that actually
 * materialises in a hospital.
 */
export const staffPasswordSchema = z
  .string()
  .min(12, 'Use at least 12 characters')
  .max(128);

export const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  role: z.enum(ROLES),
  password: staffPasswordSchema,
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

/**
 * What an administrator may change afterwards.
 *
 * Not the email: it is the login identity and half of the unique key, and
 * changing it silently moves an account from one person to another. Deactivate
 * and create instead, which leaves both facts in the audit trail.
 */
export const updateUserSchema = z
  .object({
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().min(1).max(100).optional(),
    role: z.enum(ROLES).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: 'Nothing to change',
  });
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const setUserActiveSchema = z.object({ isActive: z.boolean() });
export type SetUserActiveInput = z.infer<typeof setUserActiveSchema>;

export const resetPasswordSchema = z.object({ password: staffPasswordSchema });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

/**
 * The permission matrix, for the read-only view of it.
 *
 * Sent from the server rather than imported directly by the client so that
 * what an administrator is shown is what the server will actually enforce,
 * even if a stale bundle is cached in somebody's browser.
 */
export const roleMatrixSchema = z.object({
  permissions: z.array(z.enum(PERMISSIONS)),
  roles: z.array(
    z.object({
      role: z.enum(ROLES),
      label: z.string(),
      permissions: z.array(z.enum(PERMISSIONS)),
    }),
  ),
});
export type RoleMatrix = z.infer<typeof roleMatrixSchema>;
