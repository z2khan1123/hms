import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface AuditInput {
  tenantId: string | null;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  method: string;
  path: string;
  ip?: string | null;
  userAgent?: string | null;
  outcome: 'success' | 'failure';
  metadata?: Record<string, unknown> | null;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Never throws — an audit-write failure must not break the request, but is logged loudly. */
  async record(input: AuditInput): Promise<void> {
    try {
      await this.prisma.auditEvent.create({
        data: {
          tenantId: input.tenantId,
          actorId: input.actorId,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId ?? null,
          method: input.method,
          path: input.path,
          ip: input.ip ?? null,
          userAgent: input.userAgent ?? null,
          outcome: input.outcome,
          metadata: (input.metadata ?? undefined) as never,
        },
      });
    } catch (err) {
      this.logger.error(
        `Failed to write audit event "${input.action}": ${String(err)}`,
      );
    }
  }
}
