import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PORTAL_PUBLIC_KEY } from './portal-public.decorator.js';
import { PortalAuthService } from './portal-auth.service.js';

export interface PortalCaller {
  accountId: string;
  patientId: string;
  tenantId: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      portal?: PortalCaller;
    }
  }
}

/**
 * Guards the portal.
 *
 * It verifies a portal token and nothing else — it will not accept a staff
 * token, because `verifyToken` insists on the `typ: 'portal'` claim. The result
 * lands on `req.portal`, deliberately not on `req.user`, so no staff guard or
 * service can ever mistake a patient for a member of staff.
 */
@Injectable()
export class PortalGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: PortalAuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Only the handler is consulted. Reading the class here would let the
    // controller-level `@Public()` — which exists to stand the STAFF guards
    // down — switch this guard off as well.
    const isOpen = this.reflector.get<boolean>(
      PORTAL_PUBLIC_KEY,
      context.getHandler(),
    );
    if (isOpen) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      throw new UnauthorizedException('Sign in to view your records');
    }

    const caller = await this.auth.verifyToken(header.slice(7));
    if (!caller) throw new UnauthorizedException('Sign in to view your records');

    req.portal = caller;
    return true;
  }
}
