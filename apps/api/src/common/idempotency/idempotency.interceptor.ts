import {
  type CallHandler,
  ConflictException,
  type ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
  UnprocessableEntityException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { IDEMPOTENCY_HEADER, idempotencyKeySchema } from '@hms/shared';
import type { Request, Response } from 'express';
import { Observable, from, of } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service.js';

/** How long a key is honoured. A desk does not retry a week-old registration. */
const TTL_HOURS = 24;

/**
 * Makes a retried write safe.
 *
 * A request that timed out may or may not have been applied. Without this, a
 * front desk pressing the button again after the line drops creates a second
 * patient — and nobody notices until somebody is looking at two records for one
 * person.
 *
 * A client sends `Idempotency-Key: <uuid>` on a write. The first time, the
 * response is stored against that key; every repeat replays it verbatim, so a
 * retry is indistinguishable from the original as far as the caller is
 * concerned.
 *
 * Sending the same key with a DIFFERENT body is refused rather than replayed.
 * That is a client bug, and answering it with the earlier response would
 * silently throw away whatever they actually meant to send.
 *
 * The header is optional: a request without one behaves exactly as before, so
 * this costs nothing for callers that do not need it.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger('Idempotency');

  constructor(private readonly prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();

    if (req.method !== 'POST' && req.method !== 'PUT') return next.handle();

    const raw = req.headers[IDEMPOTENCY_HEADER];
    const presented = typeof raw === 'string' ? raw : undefined;
    if (!presented) return next.handle();

    const parsed = idempotencyKeySchema.safeParse(presented);
    if (!parsed.success) {
      throw new UnprocessableEntityException(
        'Idempotency-Key must be a UUID',
      );
    }
    const key = parsed.data;

    const tenantId = req.user?.tenantId;
    // Without a tenant there is nothing to scope the key to, and the write
    // would be pre-authentication anyway. Let it through unrecorded.
    if (!tenantId) return next.handle();

    const requestHash = createHash('sha256')
      .update(`${req.method} ${req.originalUrl} ${JSON.stringify(req.body ?? {})}`)
      .digest('hex');

    return from(
      this.prisma.idempotencyRecord.findFirst({
        where: { tenantId, key },
      }),
    ).pipe(
      switchMap((existing) => {
        if (existing) {
          if (existing.requestHash !== requestHash) {
            throw new ConflictException(
              'That idempotency key was already used with a different request',
            );
          }
          // Replay. The caller cannot tell this from the original.
          res.status(existing.responseStatus);
          res.setHeader('idempotent-replay', 'true');
          return of(existing.responseBody);
        }

        return next.handle().pipe(
          tap((body) => {
            void this.record(
              tenantId,
              key,
              req,
              requestHash,
              res.statusCode,
              body,
            );
          }),
        );
      }),
    );
  }

  /**
   * Written after the fact rather than inside the handler's transaction.
   *
   * That is a deliberate trade. Recording it transactionally would need the
   * interceptor to reach into every service's transaction, and the failure it
   * would prevent — the process dying between commit and record — leaves the
   * key unrecorded, so a retry runs again. That is the same behaviour as having
   * no idempotency at all for that one request, rather than a new failure.
   * Losing the record must never fail the request that succeeded.
   */
  private async record(
    tenantId: string,
    key: string,
    req: Request,
    requestHash: string,
    status: number,
    body: unknown,
  ): Promise<void> {
    try {
      await this.prisma.idempotencyRecord.create({
        data: {
          tenantId,
          key,
          method: req.method,
          path: req.originalUrl.slice(0, 300),
          requestHash,
          responseStatus: status,
          responseBody: (body ?? {}) as object,
          createdById: req.user?.id ?? null,
          expiresAt: new Date(Date.now() + TTL_HOURS * 3600_000),
        },
      });
    } catch (e) {
      // A unique violation here means two copies of the same request raced.
      // Both did the work; the loser simply does not get to store its answer.
      const code = (e as { code?: string }).code;
      if (code !== 'P2002') {
        this.logger.warn(`Could not record idempotency key: ${String(e)}`);
      }
    }
  }
}
