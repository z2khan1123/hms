import { type ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';
import type { PortalCaller } from './portal.guard.js';

/** The signed-in patient. Present only behind `PortalGuard`. */
export const CurrentPortalUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): PortalCaller => {
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!req.portal) throw new Error('PortalGuard did not run on this route');
    return req.portal;
  },
);
