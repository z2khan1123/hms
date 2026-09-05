import type { Role } from '@hms/shared';

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  tenantId: string | null;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}
