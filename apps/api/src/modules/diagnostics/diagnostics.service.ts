import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import {
  type DiagnosticReport as DiagnosticReportDto,
  flagValue,
  type SaveDiagnosticReportInput,
  type ServiceDepartment,
} from '@hms/shared';
import { PrismaService } from '../../prisma/prisma.service.js';
import { findOrCreateReportInTx } from './report-provisioning.js';
import {
  diagnosticReportInclude,
  type DiagnosticReportRow,
  toDiagnosticReportDto,
} from './diagnostics.mapper.js';

export interface DiagnosticReportListFilter {
  department?: ServiceDepartment;
  patientId?: string;
  caseId?: string;
  pendingOnly?: boolean;
  q?: string;
}

const LIST_LIMIT = 500;

@Injectable()
export class DiagnosticsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    tenantId: string,
    filter: DiagnosticReportListFilter,
  ): Promise<DiagnosticReportDto[]> {
    const where: Prisma.DiagnosticReportWhereInput = {
      tenantId,
      department: filter.department,
      patientId: filter.patientId,
      caseId: filter.caseId,
      ...(filter.pendingOnly ? { reportedAt: null } : {}),
      ...(filter.q
        ? {
            OR: [
              {
                serviceOrder: {
                  serviceName: { contains: filter.q, mode: 'insensitive' },
                },
              },
              {
                patient: {
                  OR: [
                    { mrn: { contains: filter.q, mode: 'insensitive' } },
                    { firstName: { contains: filter.q, mode: 'insensitive' } },
                    { lastName: { contains: filter.q, mode: 'insensitive' } },
                  ],
                },
              },
            ],
          }
        : {}),
    };

    const rows = await this.prisma.diagnosticReport.findMany({
      where,
      include: diagnosticReportInclude,
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
    });
    return this.toDtos(rows);
  }

  async get(tenantId: string, id: string): Promise<DiagnosticReportDto> {
    const row = await this.prisma.diagnosticReport.findFirst({
      where: { id, tenantId },
      include: diagnosticReportInclude,
    });
    if (!row) throw new NotFoundException('Report not found');
    return (await this.toDtos([row]))[0]!;
  }

  async getByOrder(
    tenantId: string,
    serviceOrderId: string,
  ): Promise<DiagnosticReportDto> {
    const row = await this.prisma.diagnosticReport.findFirst({
      where: { serviceOrderId, tenantId },
      include: diagnosticReportInclude,
    });
    if (!row) throw new NotFoundException('No report for this order yet');
    return (await this.toDtos([row]))[0]!;
  }

  /**
   * The technician's save. One transaction: find or create the report, refuse
   * if it is already final, replace every value (snapshotting each parameter's
   * name/unit/reference range so a later catalogue edit can never rewrite a
   * delivered report), then move the order — to `completed` when finalising,
   * otherwise to `in_progress` if it has not started.
   */
  async saveByOrder(
    tenantId: string,
    actorId: string,
    serviceOrderId: string,
    input: SaveDiagnosticReportInput,
  ): Promise<DiagnosticReportDto> {
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.serviceOrder.findFirst({
        where: { id: serviceOrderId, tenantId },
        select: {
          id: true,
          status: true,
          serviceId: true,
          caseId: true,
          patientId: true,
          department: true,
          startedAt: true,
        },
      });
      if (!order) throw new NotFoundException('Order not found');

      const report = await findOrCreateReportInTx(tx, tenantId, order);
      if (report.reportedAt) {
        throw new ConflictException(
          'This report has already been finalised and handed over. Issue a ' +
            'new report to correct it rather than rewriting the delivered one.',
        );
      }

      const params = report.labTestId
        ? await tx.labTestParameter.findMany({
            where: { tenantId, labTestId: report.labTestId },
          })
        : [];
      const paramById = new Map(params.map((p) => [p.id, p]));

      await tx.diagnosticValue.deleteMany({ where: { reportId: report.id } });

      const values = input.values ?? [];
      for (let i = 0; i < values.length; i += 1) {
        const v = values[i]!;
        let name = v.name ?? null;
        let unit = v.unit ?? null;
        let refLow: number | null = null;
        let refHigh: number | null = null;
        let refText: string | null = null;

        if (v.parameterId) {
          const p = paramById.get(v.parameterId);
          if (!p) {
            throw new BadRequestException(
              'A value references a parameter that is not on this test',
            );
          }
          // Snapshot — editing the catalogue later must never rewrite a report.
          name = p.name;
          unit = p.unit;
          refLow = p.refLow;
          refHigh = p.refHigh;
          refText = p.refText;
        } else if (!name) {
          throw new BadRequestException(
            'A value needs either a parameterId or a name',
          );
        }

        await tx.diagnosticValue.create({
          data: {
            tenantId,
            reportId: report.id,
            parameterId: v.parameterId ?? null,
            name,
            unit,
            valueText: v.valueText ?? null,
            valueNumber: v.valueNumber ?? null,
            flag: flagValue(v.valueNumber ?? null, refLow, refHigh),
            refLow,
            refHigh,
            refText,
            sortOrder: i,
          },
        });
      }

      const reportData: Prisma.DiagnosticReportUncheckedUpdateInput = {
        findings: input.findings ?? null,
        impression: input.impression ?? null,
        comments: input.comments ?? null,
      };
      const now = new Date();
      if (input.finalise) {
        reportData.reportedAt = now;
        reportData.reportedById = actorId;
      }
      await tx.diagnosticReport.update({
        where: { id: report.id },
        data: reportData,
      });

      if (input.finalise) {
        await tx.serviceOrder.update({
          where: { id: order.id },
          data: {
            status: 'completed',
            startedAt: order.startedAt ?? now,
            completedAt: now,
            completedById: actorId,
          },
        });
      } else if (
        order.status === 'ordered' ||
        order.status === 'sample_collected'
      ) {
        await tx.serviceOrder.update({
          where: { id: order.id },
          data: {
            status: 'in_progress',
            startedAt: order.startedAt ?? now,
            startedById: actorId,
          },
        });
      }
    });

    return this.getByOrder(tenantId, serviceOrderId);
  }

  private async toDtos(
    rows: DiagnosticReportRow[],
  ): Promise<DiagnosticReportDto[]> {
    const names = await this.authorNames(rows.map((r) => r.reportedById));
    return rows.map((r) =>
      toDiagnosticReportDto(
        r,
        r.reportedById ? names.get(r.reportedById) ?? null : null,
      ),
    );
  }

  private async authorNames(
    ids: (string | null)[],
  ): Promise<Map<string, string>> {
    const wanted = [...new Set(ids.filter((x): x is string => !!x))];
    if (wanted.length === 0) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: wanted } },
      select: { id: true, firstName: true, lastName: true },
    });
    return new Map(
      users.map((u) => [u.id, `${u.firstName} ${u.lastName}`.trim()]),
    );
  }
}
