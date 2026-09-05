import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from './auth-user.js';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser | undefined => {
    const request = ctx.switchToHttp().getRequest<Request>();
    return request.user;
  },
);
