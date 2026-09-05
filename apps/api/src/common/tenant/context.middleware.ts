import { Injectable, type NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { jwtPayloadSchema } from '@hms/shared';
import type { NextFunction, Request, Response } from 'express';
import { runWithContext } from './tenant-context.js';

/**
 * Runs before guards. Verifies the access token (if present), attaches
 * `req.user`, and establishes the per-request AsyncLocalStorage context that
 * carries `tenantId` down to PrismaService and the audit trail.
 */
@Injectable()
export class ContextMiddleware implements NestMiddleware {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  use(req: Request, _res: Response, next: NextFunction): void {
    const header = req.headers.authorization;

    if (header?.startsWith('Bearer ')) {
      try {
        const raw = this.jwt.verify(header.slice(7), {
          secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        });
        const payload = jwtPayloadSchema.parse(raw);
        req.user = {
          id: payload.sub,
          email: payload.email,
          role: payload.role,
          tenantId: payload.tenantId,
        };
      } catch {
        // Invalid / expired token: leave req.user undefined. Guards return 401
        // for protected routes; public routes proceed unauthenticated.
      }
    }

    runWithContext(
      {
        tenantId: req.user?.tenantId ?? null,
        userId: req.user?.id ?? null,
        role: req.user?.role ?? null,
      },
      () => next(),
    );
  }
}
