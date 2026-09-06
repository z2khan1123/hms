import type { Prisma, VitalType } from '@prisma/client';
import type {
  VitalReading as VitalReadingDto,
  VitalType as VitalTypeDto,
} from '@hms/shared';

export const vitalReadingInclude = { vitalType: true } as const;

export type VitalReadingRow = Prisma.VitalReadingGetPayload<{
  include: typeof vitalReadingInclude;
}>;

export function toVitalTypeDto(t: VitalType): VitalTypeDto {
  return {
    id: t.id,
    name: t.name,
    unit: t.unit,
    refLow: t.refLow,
    refHigh: t.refHigh,
    isActive: t.isActive,
  };
}

export function toVitalReadingDto(r: VitalReadingRow): VitalReadingDto {
  return {
    id: r.id,
    value: r.value,
    flag: r.flag,
    recordedAt: r.recordedAt.toISOString(),
    vitalType: toVitalTypeDto(r.vitalType),
  };
}
