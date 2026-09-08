import type { Permission, Role } from '@hms/shared';

/**
 * Whoever is making this request — a signed-in person, or a machine holding an
 * API key.
 *
 * The difference that matters is `scopes`. A person's authority comes from
 * their role and moves when the role moves. A key's authority is the explicit
 * list it was issued with and never moves: widening the pathologist role must
 * not quietly widen a key somebody issued last year to read lab results.
 */
export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  tenantId: string | null;
  /** Present only for API keys. When present, it IS the authority. */
  scopes?: readonly Permission[];
  /** The key that authenticated this request, for the audit trail. */
  apiKeyId?: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
