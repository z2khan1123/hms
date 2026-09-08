import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  analyticsQuerySchema,
  type AnalyticsQuery,
  type AnalyticsResult,
  type CreateSavedViewInput,
  type Dataset,
  type Permission,
  type SavedView,
  type UpdateSavedViewInput,
  roleHasPermission,
  validateQuery,
} from '@hms/shared';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { compareNatural } from '../../common/util/natural-sort.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { buildQuery } from './analytics.builder.js';
import { DATASETS, findDataset, toDatasetDto } from './analytics.registry.js';

/**
 * The analytics engine.
 *
 * `analytics:read` opens the screen. Reaching any dataset additionally requires
 * that dataset's OWN read permission, checked here on every single query and
 * on every saved view that is listed or run. A receptionist can open reports
 * and will simply not be offered payroll; if they craft the request by hand
 * they get a 403, not rows.
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  private can(user: AuthUser, permission: Permission): boolean {
    return roleHasPermission(user.role, permission);
  }

  /** Only the datasets this user may actually read. */
  listDatasets(user: AuthUser): Dataset[] {
    return DATASETS.filter((d) => this.can(user, d.requires)).map(toDatasetDto);
  }

  private resolve(user: AuthUser, datasetId: string) {
    const dataset = findDataset(datasetId);
    if (!dataset) throw new NotFoundException(`Unknown dataset "${datasetId}"`);
    if (!this.can(user, dataset.requires)) {
      throw new ForbiddenException(
        `You do not have access to ${dataset.label.toLowerCase()}`,
      );
    }
    return dataset;
  }

  async run(
    tenantId: string,
    user: AuthUser,
    query: AnalyticsQuery,
  ): Promise<AnalyticsResult> {
    const dataset = this.resolve(user, query.dataset);

    // The same validator the client ran, re-run here — the client's copy is a
    // courtesy that keeps the UI honest, never the thing that makes it safe.
    const problem = validateQuery(query, toDatasetDto(dataset));
    if (problem) throw new BadRequestException(problem);

    const { sql, columns, limit } = buildQuery(dataset, query, tenantId);

    const started = Date.now();
    const raw = await this.prisma.$queryRaw<Record<string, unknown>[]>(sql);
    const elapsedMs = Date.now() - started;

    const truncated = raw.length > limit;
    const rows = (truncated ? raw.slice(0, limit) : raw).map((r) =>
      normaliseRow(r, columns),
    );

    return { columns, rows, truncated, elapsedMs };
  }

  // --- saved views ----------------------------------------------------

  /**
   * Your own views plus anything shared — but only on datasets you can read,
   * so a shared payroll view is invisible to a receptionist rather than
   * appearing and then failing when opened.
   */
  async listSavedViews(
    tenantId: string,
    user: AuthUser,
    datasetId?: string,
  ): Promise<SavedView[]> {
    const rows = await this.prisma.savedView.findMany({
      where: {
        tenantId,
        ...(datasetId ? { dataset: datasetId } : {}),
        OR: [{ createdById: user.id }, { isShared: true }],
      },
      include: {
        createdBy: { select: { firstName: true, lastName: true } },
      },
    });

    return rows
      .filter((r) => {
        const d = findDataset(r.dataset);
        return d ? this.can(user, d.requires) : false;
      })
      .map((r) => this.toSavedViewDto(r, user))
      .sort((a, b) => compareNatural(a.name, b.name));
  }

  async createSavedView(
    tenantId: string,
    user: AuthUser,
    input: CreateSavedViewInput,
  ): Promise<SavedView> {
    const dataset = this.resolve(user, input.query.dataset);
    const problem = validateQuery(input.query, toDatasetDto(dataset));
    if (problem) throw new BadRequestException(problem);

    if (input.isShared && !this.can(user, 'analytics:share')) {
      throw new ForbiddenException('You cannot share a view with everyone');
    }

    const created = await this.prisma.savedView
      .create({
        data: {
          tenantId,
          name: input.name,
          description: input.description ?? null,
          dataset: dataset.id,
          query: input.query,
          isShared: input.isShared ?? false,
          createdById: user.id,
        },
        include: { createdBy: { select: { firstName: true, lastName: true } } },
      })
      .catch((e: unknown) => {
        if ((e as { code?: string }).code === 'P2002') {
          throw new BadRequestException('You already have a view with that name');
        }
        throw e;
      });

    return this.toSavedViewDto(created, user);
  }

  async updateSavedView(
    tenantId: string,
    user: AuthUser,
    id: string,
    input: UpdateSavedViewInput,
  ): Promise<SavedView> {
    const current = await this.mine(tenantId, user, id);

    if (input.query) {
      const dataset = this.resolve(user, input.query.dataset);
      const problem = validateQuery(input.query, toDatasetDto(dataset));
      if (problem) throw new BadRequestException(problem);
    }
    if (input.isShared && !this.can(user, 'analytics:share')) {
      throw new ForbiddenException('You cannot share a view with everyone');
    }

    const updated = await this.prisma.savedView.update({
      where: { id: current.id },
      data: {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(input.description === undefined
          ? {}
          : { description: input.description ?? null }),
        ...(input.query === undefined
          ? {}
          : { query: input.query, dataset: input.query.dataset }),
        ...(input.isShared === undefined ? {} : { isShared: input.isShared }),
      },
      include: { createdBy: { select: { firstName: true, lastName: true } } },
    });
    return this.toSavedViewDto(updated, user);
  }

  async deleteSavedView(
    tenantId: string,
    user: AuthUser,
    id: string,
  ): Promise<void> {
    const current = await this.mine(tenantId, user, id);
    await this.prisma.savedView.delete({ where: { id: current.id } });
  }

  /** Run a saved view. Its stored query is re-validated, never trusted. */
  async runSavedView(
    tenantId: string,
    user: AuthUser,
    id: string,
  ): Promise<AnalyticsResult> {
    const row = await this.prisma.savedView.findFirst({
      where: {
        id,
        tenantId,
        OR: [{ createdById: user.id }, { isShared: true }],
      },
    });
    if (!row) throw new NotFoundException('Saved view not found');

    // A view saved before a field was retired must fail loudly here rather
    // than quietly return the wrong thing.
    const parsed = analyticsQuerySchema.safeParse(row.query);
    if (!parsed.success) {
      throw new BadRequestException(
        'This saved view no longer matches the data available. Edit and save it again.',
      );
    }
    return this.run(tenantId, user, parsed.data);
  }

  /** Only the owner may change or delete a view, shared or not. */
  private async mine(tenantId: string, user: AuthUser, id: string) {
    const row = await this.prisma.savedView.findFirst({
      where: { id, tenantId },
      select: { id: true, createdById: true },
    });
    if (!row) throw new NotFoundException('Saved view not found');
    if (row.createdById !== user.id) {
      throw new ForbiddenException('Only the person who saved a view can change it');
    }
    return row;
  }

  private toSavedViewDto(
    row: {
      id: string;
      name: string;
      description: string | null;
      dataset: string;
      query: unknown;
      isShared: boolean;
      createdById: string | null;
      createdAt: Date;
      updatedAt: Date;
      createdBy?: { firstName: string; lastName: string } | null;
    },
    user: AuthUser,
  ): SavedView {
    const parsed = analyticsQuerySchema.safeParse(row.query);
    if (!parsed.success) {
      throw new BadRequestException(
        `Saved view "${row.name}" is no longer valid. Edit and save it again.`,
      );
    }
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      dataset: row.dataset,
      query: parsed.data,
      isShared: row.isShared,
      createdBy: row.createdBy
        ? `${row.createdBy.firstName} ${row.createdBy.lastName}`.trim()
        : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      isMine: row.createdById === user.id,
    };
  }
}

/**
 * Postgres hands back `numeric` as a string and `bigint` as a BigInt, either of
 * which would arrive on the client as something it cannot add up. Money stays
 * an integer count of minor units; averages are rounded to the paisa, because
 * a fraction of a paisa is not a thing anyone can be paid.
 */
function normaliseRow(
  row: Record<string, unknown>,
  columns: { key: string; kind: string }[],
): Record<string, string | number | boolean | null> {
  const out: Record<string, string | number | boolean | null> = {};
  for (const col of columns) {
    const v = row[col.key];
    if (v === null || v === undefined) {
      out[col.key] = null;
    } else if (typeof v === 'bigint') {
      out[col.key] = Number(v);
    } else if (v instanceof Date) {
      out[col.key] = col.kind === 'date' ? v.toISOString().slice(0, 10) : v.toISOString();
    } else if (typeof v === 'object' && 'toFixed' in (v as object)) {
      out[col.key] = Number(v);
    } else if (typeof v === 'string' && (col.kind === 'number' || col.kind === 'money')) {
      const n = Number(v);
      out[col.key] = Number.isFinite(n) ? n : null;
    } else if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') {
      out[col.key] = v;
    } else {
      out[col.key] = String(v);
    }

    if (col.kind === 'money' && typeof out[col.key] === 'number') {
      out[col.key] = Math.round(out[col.key] as number);
    }
  }
  return out;
}
