import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { getTenantId } from '../common/tenant/tenant-context.js';

/**
 * Tables deliberately outside Row-Level Security, and therefore not wrapped
 * below. Kept here as well as in the migration so the two cannot drift — a
 * table in one list and not the other shows up immediately as queries
 * returning nothing.
 *
 * The reasons are written out in
 * `prisma/migrations/20260908090000_row_level_security/migration.sql`.
 */
const UNSCOPED_MODELS = new Set([
  'user',
  'apiKey',
  'patientAccount',
  'webhookEndpoint',
  'webhookDelivery',
  'auditEvent',
  'tenant',
  'refreshToken',
  'icd10Code',
  'icd10Group',
  // Written by an interceptor that runs before any tenant-scoped service, and
  // read on a retry that may arrive on a different connection.
  'idempotencyRecord',
]);

const SET_TENANT = (tenantId: string) =>
  Prisma.sql`SELECT set_config('app.current_tenant', ${tenantId}, true)`;

type Delegate = Record<string, (args: unknown) => Promise<unknown>>;

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super();

    /**
     * Declare the tenant to Postgres on every query that has one.
     *
     * RLS policies read `app.current_tenant` and fail closed: a connection that
     * has not set it sees nothing. So an ordinary query has to run inside a
     * transaction that sets the variable first. `set_config(..., true)` is
     * `SET LOCAL` — scoped to the transaction — which is what makes this safe
     * under a pool, where the next request gets a different tenant on the same
     * socket.
     *
     * Note what this does NOT do: it does not call `query(args)`. That would
     * run the operation on the original connection while the variable was set
     * on the transaction's, which looks right and silently returns nothing.
     * The operation is re-issued on the transaction client instead. That client
     * is not extended, so there is no recursion.
     *
     * The cost is a round trip per query. Against a database in the same region
     * that is a millisecond or two, and it buys a guarantee the application
     * cannot give itself: a query that forgets its `where tenantId` returns
     * nothing rather than everything.
     */
    const extended = this.$extends({
      query: {
        $allModels: {
          $allOperations: async ({ model, operation, args, query }) => {
            const tenantId = getTenantId();
            if (!tenantId || UNSCOPED_MODELS.has(lowerFirst(model))) {
              return query(args);
            }
            return this.$baseTransaction(async (tx) => {
              await tx.$executeRaw(SET_TENANT(tenantId));
              const delegate = (tx as unknown as Record<string, Delegate>)[
                lowerFirst(model)
              ];
              return delegate[operation](args as unknown);
            });
          },
        },
      },
    });

    // `$extends` returns a NEW client rather than mutating this one, and every
    // service injects `PrismaService` and calls `this.prisma.<model>`. Rather
    // than thread a second client through every call site, the model delegates
    // are re-pointed at the extended client here. One place, one comment.
    const root = extended as unknown as Record<string, unknown>;
    for (const name of Object.keys(Prisma.ModelName)) {
      const prop = lowerFirst(name);
      Object.defineProperty(this, prop, {
        get: () => root[prop],
        configurable: true,
      });
    }
  }

  /** The un-extended transaction, so the wrapper above cannot recurse. */
  private $baseTransaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return super.$transaction(fn);
  }

  /**
   * Every existing `$transaction` block gets the tenant declared once, at the
   * start, for the whole unit of work.
   *
   * Without this override those blocks would run on a transaction client that
   * the extension never sees, so nothing would set the variable and every
   * statement inside would fall foul of RLS. Setting it once here is also
   * cheaper than once per statement.
   */
  // Both of Prisma's shapes are declared explicitly. A single `any[]`
  // signature would compile but erase inference at every call site, and there
  // are dozens.
  $transaction<P extends Prisma.PrismaPromise<unknown>[]>(
    arg: [...P],
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
  ): Promise<{ [K in keyof P]: Awaited<P[K]> }>;
  $transaction<R>(
    fn: (tx: Prisma.TransactionClient) => Promise<R>,
    options?: {
      maxWait?: number;
      timeout?: number;
      isolationLevel?: Prisma.TransactionIsolationLevel;
    },
  ): Promise<R>;
  $transaction(
    arg: unknown,
    options?: unknown,
  ): Promise<unknown> {
    const tenantId = getTenantId();

    if (typeof arg === 'function') {
      const fn = arg as (tx: Prisma.TransactionClient) => Promise<unknown>;
      return super.$transaction(
        async (tx) => {
          if (tenantId) await tx.$executeRaw(SET_TENANT(tenantId));
          return fn(tx);
        },
        options as { timeout?: number },
      );
    }

    // The batch form. Note that services no longer use it with model
    // delegates: an extended delegate returns a plain Promise rather than a
    // PrismaPromise, and each one would open a transaction of its own INSIDE
    // this one — which deadlocks the pool rather than failing loudly. Those
    // call sites are `Promise.all` now, so each query gets its own
    // tenant-scoped transaction. This branch remains for raw batches.
    if (Array.isArray(arg) && tenantId) {
      return super
        .$transaction(
          [super.$executeRaw(SET_TENANT(tenantId)), ...arg],
          options as { isolationLevel?: Prisma.TransactionIsolationLevel },
        )
        // Drop the `set_config` result so callers get back exactly the array
        // they asked for.
        .then((results) => results.slice(1));
    }

    return super.$transaction(
      arg as Prisma.PrismaPromise<unknown>[],
      options as { isolationLevel?: Prisma.TransactionIsolationLevel },
    );
  }

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
   * Run a unit of work as a named tenant, regardless of request context.
   *
   * For background work — a dispatcher, a scheduled job — that has no request
   * to take a tenant from but knows which one it is acting for.
   */
  async withTenant<T>(
    tenantId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return super.$transaction(async (tx) => {
      await tx.$executeRaw(SET_TENANT(tenantId));
      return fn(tx);
    });
  }
}

function lowerFirst(value: string): string {
  return value.charAt(0).toLowerCase() + value.slice(1);
}
