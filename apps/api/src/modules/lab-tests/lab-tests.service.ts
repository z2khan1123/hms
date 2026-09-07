import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import type {
  CreateLabTestInput,
  LabTest as LabTestDto,
  LabTestParameterInput,
  ServiceDepartment,
  UpdateLabTestInput,
} from '@hms/shared';
import { PrismaService } from '../../prisma/prisma.service.js';
import { labTestInclude, toLabTestDto } from './lab-tests.mapper.js';

export interface LabTestListFilter {
  department?: ServiceDepartment;
  q?: string;
  includeInactive?: boolean;
}

const LIST_LIMIT = 500;

@Injectable()
export class LabTestsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    tenantId: string,
    filter: LabTestListFilter,
  ): Promise<LabTestDto[]> {
    const where: Prisma.LabTestWhereInput = {
      tenantId,
      department: filter.department,
      ...(filter.includeInactive ? {} : { isActive: true }),
      ...(filter.q
        ? { name: { contains: filter.q, mode: 'insensitive' } }
        : {}),
    };
    const rows = await this.prisma.labTest.findMany({
      where,
      include: labTestInclude,
      orderBy: [{ department: 'asc' }, { name: 'asc' }],
      take: LIST_LIMIT,
    });
    return rows.map(toLabTestDto);
  }

  async get(tenantId: string, id: string): Promise<LabTestDto> {
    return toLabTestDto(await this.findOrThrow(tenantId, id));
  }

  async create(
    tenantId: string,
    input: CreateLabTestInput,
  ): Promise<LabTestDto> {
    await this.assertNameFree(tenantId, input.name);
    if (input.serviceId) {
      await this.assertServiceAssignable(tenantId, input.serviceId);
    }

    const created = await this.prisma.labTest.create({
      data: {
        tenantId,
        name: input.name,
        department: input.department,
        serviceId: input.serviceId ?? null,
        sampleType: input.sampleType ?? null,
        method: input.method ?? null,
        parameters: input.parameters?.length
          ? { createMany: { data: paramCreateData(tenantId, input.parameters) } }
          : undefined,
      },
      include: labTestInclude,
    });
    return toLabTestDto(created);
  }

  /**
   * `parameters`, when supplied, replaces the whole set — the technician's form
   * is edited as a unit. `serviceId`/`sampleType`/`method` follow the shared
   * contract: `null` clears, `undefined` leaves alone.
   */
  async update(
    tenantId: string,
    id: string,
    input: UpdateLabTestInput,
  ): Promise<LabTestDto> {
    await this.findOrThrow(tenantId, id);
    if (input.name !== undefined) {
      await this.assertNameFree(tenantId, input.name, id);
    }
    if (input.serviceId) {
      await this.assertServiceAssignable(tenantId, input.serviceId, id);
    }

    const data: Prisma.LabTestUpdateInput = {
      name: input.name,
      department: input.department ?? undefined,
      sampleType: input.sampleType,
      method: input.method,
      isActive: input.isActive,
    };
    if (input.serviceId !== undefined) {
      data.service =
        input.serviceId === null
          ? { disconnect: true }
          : { connect: { id: input.serviceId } };
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.labTest.update({ where: { id }, data });
      if (input.parameters !== undefined) {
        await tx.labTestParameter.deleteMany({ where: { labTestId: id } });
        if (input.parameters.length > 0) {
          await tx.labTestParameter.createMany({
            data: paramCreateData(tenantId, input.parameters).map((p) => ({
              ...p,
              labTestId: id,
            })),
          });
        }
      }
    });
    return this.get(tenantId, id);
  }

  /**
   * Soft delete (`isActive = false`) while any report references the test —
   * a delivered report must keep resolving its test. Hard delete otherwise.
   */
  async remove(
    tenantId: string,
    id: string,
  ): Promise<{ id: string; softDeleted: boolean }> {
    await this.findOrThrow(tenantId, id);
    const referencedBy = await this.prisma.diagnosticReport.count({
      where: { tenantId, labTestId: id },
    });
    if (referencedBy > 0) {
      await this.prisma.labTest.update({
        where: { id },
        data: { isActive: false },
      });
      return { id, softDeleted: true };
    }
    await this.prisma.labTest.delete({ where: { id } });
    return { id, softDeleted: false };
  }

  private async findOrThrow(tenantId: string, id: string) {
    const found = await this.prisma.labTest.findFirst({
      where: { id, tenantId },
      include: labTestInclude,
    });
    if (!found) throw new NotFoundException('Lab test not found');
    return found;
  }

  private async assertNameFree(
    tenantId: string,
    name: string,
    exceptId?: string,
  ): Promise<void> {
    const clash = await this.prisma.labTest.findFirst({
      where: { tenantId, name, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
      select: { id: true },
    });
    if (clash) {
      throw new ConflictException('A lab test with that name already exists');
    }
  }

  /** The service must belong to the tenant and not already back another test. */
  private async assertServiceAssignable(
    tenantId: string,
    serviceId: string,
    exceptTestId?: string,
  ): Promise<void> {
    const service = await this.prisma.service.findFirst({
      where: { id: serviceId, tenantId },
      select: { id: true },
    });
    if (!service) throw new BadRequestException('Unknown service');

    const claimed = await this.prisma.labTest.findFirst({
      where: {
        tenantId,
        serviceId,
        ...(exceptTestId ? { NOT: { id: exceptTestId } } : {}),
      },
      select: { id: true, name: true },
    });
    if (claimed) {
      throw new ConflictException(
        `That service is already defined by the lab test "${claimed.name}"`,
      );
    }
  }
}

function paramCreateData(
  tenantId: string,
  params: LabTestParameterInput[],
): Prisma.LabTestParameterCreateManyLabTestInput[] {
  return params.map((p, i) => ({
    tenantId,
    name: p.name,
    unit: p.unit ?? null,
    refLow: p.refLow ?? null,
    refHigh: p.refHigh ?? null,
    refText: p.refText ?? null,
    sortOrder: i,
  }));
}
