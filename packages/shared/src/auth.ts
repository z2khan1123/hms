import { z } from 'zod';
import { ROLES } from './rbac.js';

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  email: z.string().trim().email(),
  password: z
    .string()
    .min(12, 'Use at least 12 characters')
    .max(128),
  firstName: z.string().trim().min(1).max(100),
  lastName: z.string().trim().min(1).max(100),
  /** Tenant name — only used when bootstrapping a brand-new hospital. */
  tenantName: z.string().trim().min(2).max(160).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const sessionUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  firstName: z.string(),
  lastName: z.string(),
  role: z.enum(ROLES),
  tenantId: z.string().uuid().nullable(),
});
export type SessionUser = z.infer<typeof sessionUserSchema>;

export const authResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  user: sessionUserSchema,
});
export type AuthResponse = z.infer<typeof authResponseSchema>;

export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

/** Shape of the decoded access-token payload. */
export const jwtPayloadSchema = z.object({
  sub: z.string().uuid(),
  email: z.string().email(),
  role: z.enum(ROLES),
  tenantId: z.string().uuid().nullable(),
});
export type JwtPayload = z.infer<typeof jwtPayloadSchema>;
