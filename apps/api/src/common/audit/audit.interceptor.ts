import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { type Observable, tap } from 'rxjs';
import { AUDIT_ACTION_KEY } from './audit.decorator.js';
import { AuditService } from './audit.service.js';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const req = context.switchToHttp().getRequest<Request>();
    const explicitAction = this.reflector.getAllAndOverride<string>(
      AUDIT_ACTION_KEY,
      [context.getHandler(), context.getClass()],
    );
    const isMutation = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if (!explicitAction && !isMutation) return next.handle();

    const entityType = context
      .getClass()
      .name.replace(/Controller$/, '')
      .toLowerCase();
    const base = {
      tenantId: req.user?.tenantId ?? null,
      actorId: req.user?.id ?? null,
      action: explicitAction ?? `${entityType}.${req.method.toLowerCase()}`,
      entityType,
      entityId: (req.params?.id as string | undefined) ?? null,
      method: req.method,
      path: req.originalUrl.split('?')[0],
      ip: req.ip ?? null,
      userAgent: req.headers['user-agent'] ?? null,
      // Deliberately no request body — never put PHI values in the audit trail.
      metadata: null,
    };

    return next.handle().pipe(
      tap({
        next: () => void this.audit.record({ ...base, outcome: 'success' }),
        error: () => void this.audit.record({ ...base, outcome: 'failure' }),
      }),
    );
  }
}
