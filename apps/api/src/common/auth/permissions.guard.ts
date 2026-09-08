import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Permission } from '@hms/shared';
import type { Request } from 'express';
import { callerHasPermission } from './granted.js';
import { PERMISSIONS_KEY } from './permissions.decorator.js';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const user = context.switchToHttp().getRequest<Request>().user;
    if (!user) throw new ForbiddenException('No authenticated user');

    const missing = required.filter((p) => !callerHasPermission(user, p));
    if (missing.length > 0) {
      // An API key says so explicitly: "this key was not issued that scope"
      // is a very different debugging problem from "your role lacks it".
      throw new ForbiddenException(
        user.scopes
          ? `This API key is missing scope(s): ${missing.join(', ')}`
          : `Missing permission(s): ${missing.join(', ')}`,
      );
    }
    return true;
  }
}
