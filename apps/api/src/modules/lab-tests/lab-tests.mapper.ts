import type { Prisma } from '@prisma/client';
import type { LabTest as LabTestDto } from '@hms/shared';

/** The test plus its billable service's name and its parameters, ordered. */
export const labTestInclude = {
  service: { select: { name: true } },
  parameters: { orderBy: { sortOrder: 'asc' } },
} as const satisfies Prisma.LabTestInclude;

export type LabTestRow = Prisma.LabTestGetPayload<{
  include: typeof labTestInclude;
}>;

export function toLabTestDto(t: LabTestRow): LabTestDto {
  return {
    id: t.id,
    name: t.name,
    department: t.department,
    serviceId: t.serviceId,
    serviceName: t.service?.name ?? null,
    sampleType: t.sampleType,
    method: t.method,
    isActive: t.isActive,
    parameters: t.parameters.map((p) => ({
      id: p.id,
      name: p.name,
      unit: p.unit,
      refLow: p.refLow,
      refHigh: p.refHigh,
      refText: p.refText,
      sortOrder: p.sortOrder,
    })),
  };
}
