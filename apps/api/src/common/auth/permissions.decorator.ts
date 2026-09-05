import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@hms/shared';

export const PERMISSIONS_KEY = 'requiredPermissions';

/** Declare the permission(s) a route requires. Resolved against the RBAC matrix. */
export const Permissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
