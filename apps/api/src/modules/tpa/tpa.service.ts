import { Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma, Tpa } from '@prisma/client';
import type { CreateTpaInput, Tpa as TpaDto } from '@hms/shared';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface UpdateTpaInput extends Partial<CreateTpaInput> {
  isActive?: boolean;
}

export interface TpaListFilter {
  q?: string;
  includeInactive?: boolean;
}

@Injectable()
export class TpaService {
  constructor(private readonly prisma: PrismaService) {}

  async create(tenantId: string, input: CreateTpaInput): Promise<TpaDto> {
    const created = await this.prisma.tpa.create({
      data: {
        tenantId,
        name: input.name,
        code: input.code ?? null,
        phone: input.phone ?? null,
        address: input.address ?? null,
        contactPersonName: input.contactPersonName ?? null,
        contactPersonPhone: input.contactPersonPhone ?? null,
      },
    });
    return toDto(created);
  }

  async list(tenantId: string, filter: TpaListFilter): Promise<TpaDto[]> {
    const where: Prisma.TpaWhereInput = {
      tenantId,
      ...(filter.includeInactive ? {} : { isActive: true }),
      ...(filter.q
        ? {
            OR: [
              { name: { contains: filter.q, mode: 'insensitive' } },
              { code: { contains: filter.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const rows = await this.prisma.tpa.findMany({
      where,
      orderBy: { name: 'asc' },
    });
    return rows.map(toDto);
  }

  async get(tenantId: string, id: string): Promise<TpaDto> {
    return toDto(await this.findOrThrow(tenantId, id));
  }

  async update(
    tenantId: string,
    id: string,
    input: UpdateTpaInput,
  ): Promise<TpaDto> {
    await this.findOrThrow(tenantId, id);
    const updated = await this.prisma.tpa.update({
      where: { id },
      data: {
        name: input.name,
        code: input.code,
        phone: input.phone,
        address: input.address,
        contactPersonName: input.contactPersonName,
        contactPersonPhone: input.contactPersonPhone,
        isActive: input.isActive,
      },
    });
    return toDto(updated);
  }

  /** Deactivate rather than delete — cases and patients reference the payer. */
  async deactivate(tenantId: string, id: string): Promise<TpaDto> {
    await this.findOrThrow(tenantId, id);
    const updated = await this.prisma.tpa.update({
      where: { id },
      data: { isActive: false },
    });
    return toDto(updated);
  }

  private async findOrThrow(tenantId: string, id: string): Promise<Tpa> {
    const found = await this.prisma.tpa.findFirst({ where: { id, tenantId } });
    if (!found) throw new NotFoundException('TPA not found');
    return found;
  }
}

function toDto(t: Tpa): TpaDto {
  return {
    id: t.id,
    name: t.name,
    code: t.code,
    phone: t.phone,
    address: t.address,
    contactPersonName: t.contactPersonName,
    contactPersonPhone: t.contactPersonPhone,
    isActive: t.isActive,
  };
}
