import { Injectable } from '@nestjs/common';
import type { Practitioner } from '@prisma/client';
import {
  type CreatePractitionerInput,
  type Practitioner as PractitionerDto,
} from '@hms/shared';
import { PrismaService } from '../../prisma/prisma.service.js';

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
      },
    });
    return toDto(created);
  }

  async list(tenantId: string): Promise<PractitionerDto[]> {
    const rows = await this.prisma.practitioner.findMany({
      where: { tenantId, isActive: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    return rows.map(toDto);
  }
}

function toDto(p: Practitioner): PractitionerDto {
  return {
    id: p.id,
    firstName: p.firstName,
    lastName: p.lastName,
    specialty: p.specialty,
    isActive: p.isActive,
  };
}
