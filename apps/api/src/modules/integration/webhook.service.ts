import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import {
  type CreateWebhookInput,
  type DeliveryStatus,
  type UpdateWebhookInput,
  type Webhook,
  type WebhookCreated,
  type WebhookDelivery,
  type WebhookEvent,
} from '@hms/shared';
import { toIsoDateTimeOrNull } from '../../common/util/dates.js';
import { PrismaService } from '../../prisma/prisma.service.js';

/** How far back "recent failures" looks, for the endpoint health figure. */
const HEALTH_WINDOW = 20;

type EndpointRow = {
  id: string;
  tenantId: string;
  url: string;
  description: string | null;
  events: string[];
  isActive: boolean;
  createdById: string | null;
  createdAt: Date;
};

/**
 * Outbound webhooks.
 *
 * The rule that matters: a delivery is RECORDED inside the transaction that
 * caused it and SENT afterwards, by a separate dispatcher. A webhook endpoint
 * that is down, slow, or hostile can then never fail — or delay — the clinical
 * action that triggered it. Registering a patient must not depend on somebody
 * else's server being up.
 */
@Injectable()
export class WebhookService {
  constructor(private readonly prisma: PrismaService) {}

  // --- endpoints ------------------------------------------------------

  async list(tenantId: string): Promise<Webhook[]> {
    const rows = await this.prisma.webhookEndpoint.findMany({
      where: { tenantId },
      orderBy: [{ createdAt: 'desc' }],
    });
    return this.decorate(tenantId, rows);
  }

  /**
   * The signing secret is shown once, exactly like an API key. The receiver
   * needs it to verify our signature; we only ever need it to produce one.
   */
  async create(
    tenantId: string,
    createdById: string,
    input: CreateWebhookInput,
  ): Promise<WebhookCreated> {
    const secret = `whsec_${randomBytes(32).toString('base64url')}`;
    const created = await this.prisma.webhookEndpoint.create({
      data: {
        tenantId,
        url: input.url,
        description: input.description ?? null,
        secret,
        events: input.events,
        createdById,
      },
    });
    const [dto] = await this.decorate(tenantId, [created]);
    return { ...dto, secret };
  }

  async update(
    tenantId: string,
    id: string,
    input: UpdateWebhookInput,
  ): Promise<Webhook> {
    await this.find(tenantId, id);
    const updated = await this.prisma.webhookEndpoint.update({
      where: { id },
      data: {
        ...(input.url === undefined ? {} : { url: input.url }),
        ...(input.description === undefined
          ? {}
          : { description: input.description }),
        ...(input.events === undefined ? {} : { events: input.events }),
        ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      },
    });
    const [dto] = await this.decorate(tenantId, [updated]);
    return dto;
  }

  async remove(tenantId: string, id: string): Promise<void> {
    await this.find(tenantId, id);
    await this.prisma.webhookEndpoint.delete({ where: { id } });
  }

  /** Rotate the signing secret. The old one stops working immediately. */
  async rotateSecret(tenantId: string, id: string): Promise<WebhookCreated> {
    await this.find(tenantId, id);
    const secret = `whsec_${randomBytes(32).toString('base64url')}`;
    const updated = await this.prisma.webhookEndpoint.update({
      where: { id },
      data: { secret },
    });
    const [dto] = await this.decorate(tenantId, [updated]);
    return { ...dto, secret };
  }

  // --- deliveries -----------------------------------------------------

  async listDeliveries(
    tenantId: string,
    filter: { webhookId?: string; status?: DeliveryStatus; event?: WebhookEvent },
  ): Promise<WebhookDelivery[]> {
    const rows = await this.prisma.webhookDelivery.findMany({
      where: {
        tenantId,
        ...(filter.webhookId ? { webhookId: filter.webhookId } : {}),
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.event ? { event: filter.event } : {}),
      },
      orderBy: [{ createdAt: 'desc' }],
      take: 200,
    });
    return rows.map(toDeliveryDto);
  }

  /** Put an abandoned or failed delivery back in the queue, from attempt zero. */
  async retry(tenantId: string, id: string): Promise<WebhookDelivery> {
    const row = await this.prisma.webhookDelivery.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Delivery not found');
    if (row.status === 'delivered') {
      throw new ConflictException('That delivery already succeeded');
    }
    const updated = await this.prisma.webhookDelivery.update({
      where: { id },
      data: {
        status: 'pending',
        attempts: 0,
        nextAttemptAt: new Date(),
        error: null,
        responseStatus: null,
      },
    });
    return toDeliveryDto(updated);
  }

  /**
   * Queue an event for every endpoint that asked for it.
   *
   * Takes the transaction client so the delivery row is written with the change
   * that caused it: if that transaction rolls back, no phantom event escapes,
   * and if it commits, the event is guaranteed queued. Nothing is sent here.
   */
  async enqueueInTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    event: WebhookEvent,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const endpoints = await tx.webhookEndpoint.findMany({
      where: { tenantId, isActive: true, events: { has: event } },
      select: { id: true },
    });
    if (endpoints.length === 0) return;

    await tx.webhookDelivery.createMany({
      data: endpoints.map((e) => ({
        tenantId,
        webhookId: e.id,
        event,
        payload: payload as Prisma.InputJsonValue,
      })),
    });
  }

  /** The same thing outside a transaction, for callers that have none. */
  async enqueue(
    tenantId: string,
    event: WebhookEvent,
    payload: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.$transaction((tx) =>
      this.enqueueInTx(tx, tenantId, event, payload),
    );
  }

  // --- internals ------------------------------------------------------

  private async find(tenantId: string, id: string): Promise<EndpointRow> {
    const row = await this.prisma.webhookEndpoint.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Webhook not found');
    return row;
  }

  /**
   * Endpoint health is read from the deliveries themselves rather than kept as
   * a counter — a counter would need resetting, and nobody would.
   */
  private async decorate(
    tenantId: string,
    rows: EndpointRow[],
  ): Promise<Webhook[]> {
    if (rows.length === 0) return [];

    const recent = await this.prisma.webhookDelivery.findMany({
      where: { tenantId, webhookId: { in: rows.map((r) => r.id) } },
      select: {
        webhookId: true,
        status: true,
        createdAt: true,
        lastAttemptAt: true,
      },
      orderBy: [{ createdAt: 'desc' }],
      take: HEALTH_WINDOW * rows.length,
    });

    const creatorIds = [
      ...new Set(rows.map((r) => r.createdById).filter((v): v is string => !!v)),
    ];
    const names = new Map<string, string>();
    if (creatorIds.length > 0) {
      const users = await this.prisma.user.findMany({
        where: { tenantId, id: { in: creatorIds } },
        select: { id: true, firstName: true, lastName: true },
      });
      for (const u of users) names.set(u.id, `${u.firstName} ${u.lastName}`.trim());
    }

    return rows.map((r) => {
      const mine = recent.filter((d) => d.webhookId === r.id).slice(0, HEALTH_WINDOW);
      const last = mine[0];
      return {
        id: r.id,
        url: r.url,
        description: r.description,
        events: r.events as WebhookEvent[],
        isActive: r.isActive,
        createdBy: r.createdById ? (names.get(r.createdById) ?? null) : null,
        createdAt: r.createdAt.toISOString(),
        recentFailures: mine.filter(
          (d) => d.status === 'failed' || d.status === 'abandoned',
        ).length,
        lastDeliveryAt: last ? last.createdAt.toISOString() : null,
        lastDeliveryOk: last ? last.status === 'delivered' : null,
      };
    });
  }
}

export function toDeliveryDto(r: {
  id: string;
  webhookId: string;
  event: string;
  status: DeliveryStatus;
  attempts: number;
  responseStatus: number | null;
  error: string | null;
  createdAt: Date;
  lastAttemptAt: Date | null;
  nextAttemptAt: Date | null;
  deliveredAt: Date | null;
}): WebhookDelivery {
  return {
    id: r.id,
    webhookId: r.webhookId,
    event: r.event as WebhookEvent,
    status: r.status,
    attempts: r.attempts,
    responseStatus: r.responseStatus,
    error: r.error,
    createdAt: r.createdAt.toISOString(),
    lastAttemptAt: toIsoDateTimeOrNull(r.lastAttemptAt),
    nextAttemptAt: toIsoDateTimeOrNull(r.nextAttemptAt),
    deliveredAt: toIsoDateTimeOrNull(r.deliveredAt),
  };
}
