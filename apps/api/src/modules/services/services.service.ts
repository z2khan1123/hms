import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, Service } from '@prisma/client';
import type {
  CreateServiceInput,
  Service as ServiceDto,
  ServiceDepartment,
  UpdateServiceInput,
} from '@hms/shared';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface ServiceListFilter {
  department?: ServiceDepartment;
  q?: string;
  includeInactive?: boolean;
}

@Injectable()
export class ServicesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    tenantId: string,
    input: CreateServiceInput,
  ): Promise<ServiceDto> {
    const created = await this.prisma.service.create({
      data: {
        tenantId,
        name: input.name,
        department: input.department ?? null,
        defaultPriceMinor: input.defaultPriceMinor ?? null,
        description: input.description ?? null,
      },
    });
    return toDto(created);
  }

  async list(
    tenantId: string,
    filter: ServiceListFilter,
  ): Promise<ServiceDto[]> {
    const where: Prisma.ServiceWhereInput = {
      tenantId,
      department: filter.department,
      ...(filter.includeInactive ? {} : { isActive: true }),
      ...(filter.q
        ? {
            OR: [
              { name: { contains: filter.q, mode: 'insensitive' } },
              { description: { contains: filter.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.service.findMany({
      where,
      orderBy: [{ department: 'asc' }, { name: 'asc' }],
      take: 500,
    });
    return rows.map(toDto);
  }

  async get(tenantId: string, id: string): Promise<ServiceDto> {
    return toDto(await this.findOrThrow(tenantId, id));
  }

  async update(
    tenantId: string,
    id: string,
    input: UpdateServiceInput,
  ): Promise<ServiceDto> {
    await this.findOrThrow(tenantId, id);
    const updated = await this.prisma.service.update({
      where: { id },
      data: {
        name: input.name,
        department: input.department,
        defaultPriceMinor: input.defaultPriceMinor,
        description: input.description,
        isActive: input.isActive,
      },
    });
    return toDto(updated);
  }

  /**
   * Hard delete when nothing references the service; otherwise soft delete so a
   * bill that already quoted its name keeps resolving. Bill items snapshot the
   * name anyway, so a soft-deleted service never changes a printed bill.
   */
  async remove(
    tenantId: string,
    id: string,
  ): Promise<{ id: string; softDeleted: boolean }> {
    await this.findOrThrow(tenantId, id);
    const referencedBy = await this.prisma.billItem.count({
      where: { tenantId, serviceId: id },
    });
    if (referencedBy > 0) {
      await this.prisma.service.update({
        where: { id },
        data: { isActive: false },
      });
      return { id, softDeleted: true };
    }
    await this.prisma.service.delete({ where: { id } });
    return { id, softDeleted: false };
  }

  /** Billing snapshots the service onto the bill line; this is its lookup. */
  async findOrThrow(tenantId: string, id: string): Promise<Service> {
    const found = await this.prisma.service.findFirst({
      where: { id, tenantId },
    });
    if (!found) throw new NotFoundException('Service not found');
    return found;
  }
}

export function toDto(s: Service): ServiceDto {
  return {
    id: s.id,
    name: s.name,
    department: s.department,
    defaultPriceMinor: s.defaultPriceMinor,
    description: s.description,
    isActive: s.isActive,
  };
}
