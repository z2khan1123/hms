import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import type {
  CreatePractitionerInput,
  Practitioner as PractitionerDto,
  UpdatePractitionerInput,
} from '@hms/shared';
import { toPractitionerDto } from './practitioners.mapper.js';

@Injectable()
export class PractitionersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(
    tenantId: string,
    input: CreatePractitionerInput,
  ): Promise<PractitionerDto> {
    const created = await this.prisma.practitioner.create({
      data: {
        tenantId,
        firstName: input.firstName,
        lastName: input.lastName,
        specialty: input.specialty ?? null,
        consultationFeeMinor: input.consultationFeeMinor ?? null,
      },
    });
    return toPractitionerDto(created);
  }

  async list(tenantId: string): Promise<PractitionerDto[]> {
    const rows = await this.prisma.practitioner.findMany({
      where: { tenantId, isActive: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    return rows.map(toPractitionerDto);
  }

  async update(
    tenantId: string,
    id: string,
    input: UpdatePractitionerInput,
  ): Promise<PractitionerDto> {
    const existing = await this.prisma.practitioner.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Practitioner not found');

    const updated = await this.prisma.practitioner.update({
      where: { id },
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        specialty: input.specialty,
        consultationFeeMinor: input.consultationFeeMinor,
        isActive: input.isActive,
      },
    });
    return toPractitionerDto(updated);
  }
}
