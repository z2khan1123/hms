import { Injectable, type NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PORTAL_TOKEN_TYPE, jwtPayloadSchema } from '@hms/shared';
import type { NextFunction, Request, Response } from 'express';
import { ApiKeyService } from '../../modules/integration/apikey.service.js';
import { runWithContext } from './tenant-context.js';

/**
 * Runs before guards. Works out who is calling — a signed-in person via a JWT,
 * or a machine via an API key — attaches `req.user`, and establishes the
 * per-request AsyncLocalStorage context that carries `tenantId` down to
 * PrismaService and the audit trail.
 *
 * A bad credential is never an error here. It just leaves `req.user` undefined,
 * and the guards return 401 for protected routes while public routes proceed.
 */
@Injectable()
export class ContextMiddleware implements NestMiddleware {
  constructor(
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly apiKeys: ApiKeyService,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const header = req.headers.authorization;

    if (header?.startsWith('Bearer ')) {
      try {
        const raw = this.jwt.verify(header.slice(7), {
          secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        });
        // A portal token is signed with the same secret but carries `typ`.
        // Refusing it here is what stops a patient session ever becoming a
        // staff session: without this check the payload shape alone decides.
        if ((raw as { typ?: string }).typ === PORTAL_TOKEN_TYPE) {
          throw new Error('portal token presented to a staff route');
        }
        const payload = jwtPayloadSchema.parse(raw);
        req.user = {
          id: payload.sub,
          email: payload.email,
          role: payload.role,
          tenantId: payload.tenantId,
        };
      } catch {
        // Invalid / expired token: fall through unauthenticated.
      }
    }

    // Machines present a key instead. Both header forms are accepted because
    // integrations arrive with whichever their HTTP client makes easy.
    if (!req.user) {
      const presented =
        (typeof req.headers['x-api-key'] === 'string'
          ? req.headers['x-api-key']
          : undefined) ??
        (header?.startsWith('ApiKey ') ? header.slice(7) : undefined);

      if (presented) {
        try {
          req.user = (await this.apiKeys.verify(presented)) ?? undefined;
        } catch {
          // A lookup failure must not become a 500 on an unauthenticated route.
        }
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
