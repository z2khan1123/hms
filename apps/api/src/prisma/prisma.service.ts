import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { getTenantId } from '../common/tenant/tenant-context.js';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit(): Promise<void> {
    // Serverless Postgres (e.g. Neon) suspends its compute when idle; the first
    // connection has to wake it, which can exceed the driver's connect timeout.
    const maxAttempts = 5;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        await this.$connect();
        this.logger.log('Database connected');
        return;
      } catch (err) {
        if (attempt === maxAttempts) throw err;
        this.logger.warn(
          `Database connection attempt ${attempt}/${maxAttempts} failed ` +
            `(${(err as Error).message}); retrying in 2s`,
        );
        await new Promise((resolve) => setTimeout(resolve, 2_000));
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Run work with the Postgres session variable `app.current_tenant` set, so
   * Row-Level Security policies filter to the caller's tenant. Application code
   * should still pass `tenantId` in every `where` clause (defence in depth).
   */
  async withTenant<T>(
    tenantId: string,
    fn: (tx: PrismaClient) => Promise<T>,
  ): Promise<T> {
    return this.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        `SELECT set_config('app.current_tenant', $1, true)`,
        tenantId,
      );
      return fn(tx as unknown as PrismaClient);
    });
  }

  /** Convenience: use the tenant from the current request context. */
  async withCurrentTenant<T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
    const tenantId = getTenantId();
    if (!tenantId) {
      throw new Error('No tenant in the current request context');
    }
    return this.withTenant(tenantId, fn);
  }
}
