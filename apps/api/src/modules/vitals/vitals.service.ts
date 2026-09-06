import { BadRequestException, Injectable } from '@nestjs/common';
import {
  flagFor,
  type RecordVitalsInput,
  type VitalReading as VitalReadingDto,
  type VitalType as VitalTypeDto,
} from '@hms/shared';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  toVitalReadingDto,
  toVitalTypeDto,
  vitalReadingInclude,
} from './vitals.mapper.js';

export interface CreateVitalTypeInput {
  name: string;
  unit: string;
  refLow?: number;
  refHigh?: number;
}

export interface VitalListFilter {
  patientId?: string;
  opdVisitId?: string;
}

const LIST_LIMIT = 500;

@Injectable()
export class VitalsService {
  constructor(private readonly prisma: PrismaService) {}

  // --- vital types -------------------------------------------------------

  async listTypes(tenantId: string): Promise<VitalTypeDto[]> {
    const rows = await this.prisma.vitalType.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
    return rows.map(toVitalTypeDto);
  }

  async createType(
    tenantId: string,
    input: CreateVitalTypeInput,
  ): Promise<VitalTypeDto> {
    const created = await this.prisma.vitalType.create({
      data: {
        tenantId,
        name: input.name,
        unit: input.unit,
        refLow: input.refLow ?? null,
        refHigh: input.refHigh ?? null,
      },
    });
    return toVitalTypeDto(created);
  }

  // --- readings --------------------------------------------------------

  async list(
    tenantId: string,
    filter: VitalListFilter,
  ): Promise<VitalReadingDto[]> {
    const rows = await this.prisma.vitalReading.findMany({
      where: {
        tenantId,
        patientId: filter.patientId,
        opdVisitId: filter.opdVisitId,
      },
      include: vitalReadingInclude,
      orderBy: { recordedAt: 'desc' },
      take: LIST_LIMIT,
    });
    return rows.map(toVitalReadingDto);
  }

  /**
   * Records one `VitalReading` per entry in `readings`. The patient, case and
   * visit must all belong to the caller's tenant and hang together, and every
   * vital type must be the tenant's own; `flag` is derived server-side from the
   * type's reference range so the client can never disagree about what's abnormal.
   */
  async record(
    tenantId: string,
    recordedById: string,
    input: RecordVitalsInput,
  ): Promise<VitalReadingDto[]> {
    const recordedAt = input.recordedAt ? new Date(input.recordedAt) : new Date();

    const created = await this.prisma.$transaction(async (tx) => {
      const patient = await tx.patient.findFirst({
        where: { id: input.patientId, tenantId, deletedAt: null },
        select: { id: true },
      });
      if (!patient) throw new BadRequestException('Unknown patient');

      if (input.caseId) {
        const kase = await tx.case.findFirst({
          where: { id: input.caseId, tenantId },
          select: { id: true, patientId: true },
        });
        if (!kase) throw new BadRequestException('Unknown case');
        if (kase.patientId !== input.patientId) {
          throw new BadRequestException(
            'That case belongs to a different patient',
          );
        }
      }

      if (input.opdVisitId) {
        const visit = await tx.opdVisit.findFirst({
          where: { id: input.opdVisitId, tenantId },
          select: { id: true, patientId: true, caseId: true },
        });
        if (!visit) throw new BadRequestException('Unknown OPD visit');
        if (visit.patientId !== input.patientId) {
          throw new BadRequestException(
            'That visit belongs to a different patient',
          );
        }
        if (input.caseId && visit.caseId !== input.caseId) {
          throw new BadRequestException(
            'That visit belongs to a different case',
          );
        }
      }

      const typeIds = [...new Set(input.readings.map((r) => r.vitalTypeId))];
      const types = await tx.vitalType.findMany({
        where: { tenantId, id: { in: typeIds } },
      });
      if (types.length !== typeIds.length) {
        throw new BadRequestException('Unknown vital type');
      }
      const typeById = new Map(types.map((t) => [t.id, t]));

      const rows: string[] = [];
      for (const reading of input.readings) {
        const type = typeById.get(reading.vitalTypeId)!;
        const row = await tx.vitalReading.create({
          data: {
            tenantId,
            patientId: input.patientId,
            caseId: input.caseId ?? null,
            opdVisitId: input.opdVisitId ?? null,
            vitalTypeId: reading.vitalTypeId,
            value: reading.value,
            flag: flagFor(reading.value, type.refLow, type.refHigh),
            recordedAt,
            recordedById,
          },
        });
        rows.push(row.id);
      }
      return rows;
    });

    const rows = await this.prisma.vitalReading.findMany({
      where: { id: { in: created } },
      include: vitalReadingInclude,
      orderBy: { recordedAt: 'desc' },
    });
    return rows.map(toVitalReadingDto);
  }
}
