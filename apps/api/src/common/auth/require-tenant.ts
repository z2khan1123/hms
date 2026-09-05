import { ForbiddenException } from '@nestjs/common';
import type { AuthUser } from './auth-user.js';

/** Narrow `tenantId` to a string, or reject platform-scoped callers. */
export function requireTenant(user: AuthUser | undefined): string {
  if (!user?.tenantId) {
    throw new ForbiddenException('This action requires a hospital (tenant) context');
  }
  return user.tenantId;
}
