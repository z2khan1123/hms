import type { Medicine, PrescriptionItem } from '@prisma/client';
import type { PrescriptionItem as PrescriptionItemDto } from '@hms/shared';

/** The medicine is included so the prescription renders, and so the allergy
 *  check has its keywords, without a second request. */
export type PrescriptionItemRow = PrescriptionItem & {
  medicine: Pick<Medicine, 'name' | 'allergenKeywords'> | null;
};

export const prescriptionItemInclude = {
  medicine: { select: { name: true, allergenKeywords: true } },
} as const;

export function toPrescriptionItemDto(
  p: PrescriptionItemRow,
): PrescriptionItemDto {
  return {
    id: p.id,
    medicineId: p.medicineId,
    medicineName: p.medicine?.name ?? null,
    allergenKeywords: p.medicine?.allergenKeywords ?? [],
    drugName: p.drugName,
    dose: p.dose,
    frequency: p.frequency,
    durationDays: p.durationDays,
    instructions: p.instructions,
    sortOrder: p.sortOrder,
    createdAt: p.createdAt.toISOString(),
  };
}
