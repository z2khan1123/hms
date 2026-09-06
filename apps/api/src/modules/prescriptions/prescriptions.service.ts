import { Injectable, NotFoundException } from '@nestjs/common';
import type {
  PrescriptionItem as PrescriptionItemDto,
  SetPrescriptionInput,
} from '@hms/shared';
import { PrismaService } from '../../prisma/prisma.service.js';
import { toPrescriptionItemDto } from './prescriptions.mapper.js';

@Injectable()
export class PrescriptionsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    tenantId: string,
    opdVisitId: string,
  ): Promise<PrescriptionItemDto[]> {
    await this.assertVisit(tenantId, opdVisitId);
    const rows = await this.prisma.prescriptionItem.findMany({
      where: { tenantId, opdVisitId },
      orderBy: { sortOrder: 'asc' },
    });
    return rows.map(toPrescriptionItemDto);
  }

  /**
   * Replaces the whole prescription for a visit in one transaction — the doctor
   * edits the list as a whole, so a partial merge would resurrect lines they
   * removed. `sortOrder` follows the submitted order.
   */
  async set(
    tenantId: string,
    createdById: string,
    opdVisitId: string,
    input: SetPrescriptionInput,
  ): Promise<PrescriptionItemDto[]> {
    await this.assertVisit(tenantId, opdVisitId);

    await this.prisma.$transaction(async (tx) => {
      await tx.prescriptionItem.deleteMany({ where: { tenantId, opdVisitId } });
      if (input.items.length > 0) {
        await tx.prescriptionItem.createMany({
          data: input.items.map((item, index) => ({
            tenantId,
            opdVisitId,
            drugName: item.drugName,
            dose: item.dose ?? null,
            frequency: item.frequency ?? null,
            durationDays: item.durationDays ?? null,
            instructions: item.instructions ?? null,
            sortOrder: index,
            createdById,
          })),
        });
      }
    });

    return this.list(tenantId, opdVisitId);
  }

  private async assertVisit(
    tenantId: string,
    opdVisitId: string,
  ): Promise<void> {
    const found = await this.prisma.opdVisit.findFirst({
      where: { id: opdVisitId, tenantId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('OPD visit not found');
  }
}
