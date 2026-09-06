import type { PrescriptionItem } from '@prisma/client';
import type { PrescriptionItem as PrescriptionItemDto } from '@hms/shared';

export function toPrescriptionItemDto(
  p: PrescriptionItem,
): PrescriptionItemDto {
  return {
    id: p.id,
    drugName: p.drugName,
    dose: p.dose,
    frequency: p.frequency,
    durationDays: p.durationDays,
    instructions: p.instructions,
    sortOrder: p.sortOrder,
    createdAt: p.createdAt.toISOString(),
  };
}
