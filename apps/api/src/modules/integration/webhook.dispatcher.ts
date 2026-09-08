import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'node:crypto';
import {
  DELIVERY_HEADER,
  EVENT_HEADER,
  MAX_DELIVERY_ATTEMPTS,
  SIGNATURE_HEADER,
  TIMESTAMP_HEADER,
  nextAttemptAt,
  signaturePayload,
} from '@hms/shared';
import { PrismaService } from '../../prisma/prisma.service.js';

/** How often to look for due deliveries. */
const TICK_MS = 15_000;
/** How many to send per tick, so one busy tenant cannot starve the rest. */
const BATCH = 20;
/** A receiver that hangs must not hold a worker slot indefinitely. */
const REQUEST_TIMEOUT_MS = 10_000;

/**
 * Sends queued webhook deliveries.
 *
 * Runs as a plain interval inside the API process rather than pulling in a
 * scheduler dependency for one job. That is honest about what it is: fine for
 * one node, and the thing to replace with a real queue when this runs on
 * several. The claim it must keep either way is at-least-once — a delivery is
 * only marked delivered after a 2xx.
 *
 * Each attempt is claimed with a conditional update, so two API processes
 * racing on the same row cannot both send it.
 */
@Injectable()
export class WebhookDispatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WebhookDispatcher.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopped = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    // Off by default in tests, where an interval would keep the process alive.
    if (this.config.get<string>('WEBHOOK_DISPATCH') === 'off') {
      this.logger.log('Webhook dispatch disabled by WEBHOOK_DISPATCH=off');
      return;
    }
    this.timer = setInterval(() => void this.tick(), TICK_MS);
    // Never keep the process alive just to poll an empty queue.
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
  }

  /** One pass. Public so a test can drive it without waiting for the clock. */
  async tick(): Promise<number> {
    if (this.running || this.stopped) return 0;
    this.running = true;
    try {
      const due = await this.prisma.webhookDelivery.findMany({
        where: {
          status: { in: ['pending', 'failed'] },
          nextAttemptAt: { lte: new Date() },
        },
        orderBy: [{ nextAttemptAt: 'asc' }],
        take: BATCH,
        include: { webhook: true },
      });

      let sent = 0;
      for (const d of due) {
        if (this.stopped) break;
        if (await this.attempt(d)) sent += 1;
      }
      return sent;
    } catch (e) {
      this.logger.error(`Dispatch tick failed: ${String(e)}`);
      return 0;
    } finally {
      this.running = false;
    }
  }

  private async attempt(delivery: {
    id: string;
    attempts: number;
    event: string;
    payload: unknown;
    webhook: { id: string; url: string; secret: string; isActive: boolean };
  }): Promise<boolean> {
    // Claim it. If another process got there first, `count` is 0 and we skip —
    // this is what stops the same event being sent twice by two nodes.
    const claimed = await this.prisma.webhookDelivery.updateMany({
      where: {
        id: delivery.id,
        attempts: delivery.attempts,
        status: { in: ['pending', 'failed'] },
      },
      data: {
        attempts: delivery.attempts + 1,
        lastAttemptAt: new Date(),
        nextAttemptAt: null,
      },
    });
    if (claimed.count === 0) return false;

    const attemptNo = delivery.attempts + 1;

    if (!delivery.webhook.isActive) {
      await this.fail(delivery.id, attemptNo, null, 'Endpoint is disabled');
      return false;
    }

    const body = JSON.stringify({
      id: delivery.id,
      event: delivery.event,
      createdAt: new Date().toISOString(),
      data: delivery.payload,
    });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = createHmac('sha256', delivery.webhook.secret)
      .update(signaturePayload(timestamp, body))
      .digest('hex');

    const controller = new AbortController();
    const cancel = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const res = await fetch(delivery.webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [SIGNATURE_HEADER]: signature,
          [TIMESTAMP_HEADER]: timestamp,
          [EVENT_HEADER]: delivery.event,
          [DELIVERY_HEADER]: delivery.id,
          'User-Agent': 'HMS-Webhooks/1',
        },
        body,
        signal: controller.signal,
        redirect: 'error',
      });

      if (res.ok) {
        await this.prisma.webhookDelivery.update({
          where: { id: delivery.id },
          data: {
            status: 'delivered',
            responseStatus: res.status,
            deliveredAt: new Date(),
            error: null,
          },
        });
        return true;
      }

      await this.fail(
        delivery.id,
        attemptNo,
        res.status,
        `Endpoint responded ${res.status}`,
      );
      return false;
    } catch (e) {
      const message =
        (e as Error).name === 'AbortError'
          ? `No response within ${REQUEST_TIMEOUT_MS / 1000}s`
          : String((e as Error).message ?? e).slice(0, 300);
      await this.fail(delivery.id, attemptNo, null, message);
      return false;
    } finally {
      clearTimeout(cancel);
    }
  }

  /**
   * Schedule the next try, or give up. Giving up matters: an unbounded queue of
   * undeliverable events is how a webhook system becomes a disk-space incident.
   */
  private async fail(
    id: string,
    attemptNo: number,
    responseStatus: number | null,
    error: string,
  ): Promise<void> {
    const next = nextAttemptAt(attemptNo);
    await this.prisma.webhookDelivery.update({
      where: { id },
      data: {
        status: next ? 'failed' : 'abandoned',
        nextAttemptAt: next,
        responseStatus,
        error: next
          ? error
          : `${error} — given up after ${MAX_DELIVERY_ATTEMPTS} attempts`,
      },
    });
  }
}
