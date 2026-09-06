import type { BedType, Floor, Prisma } from '@prisma/client';
import {
  type Bed as BedDto,
  type BedBoard,
  type BedStatus,
  bedStatusOf,
  type BedType as BedTypeDto,
  type Floor as FloorDto,
  type Ward as WardDto,
} from '@hms/shared';

export function toFloorDto(f: Floor): FloorDto {
  return {
    id: f.id,
    name: f.name,
    sortOrder: f.sortOrder,
    isActive: f.isActive,
  };
}

export function toBedTypeDto(b: BedType): BedTypeDto {
  return {
    id: b.id,
    name: b.name,
    defaultNightlyRateMinor: b.defaultNightlyRateMinor,
    isActive: b.isActive,
  };
}

// --- wards ----------------------------------------------------------------

export const wardInclude = { floor: true } as const;

export type WardRow = Prisma.WardGetPayload<{ include: typeof wardInclude }>;

export function toWardDto(w: WardRow): WardDto {
  return {
    id: w.id,
    name: w.name,
    isActive: w.isActive,
    floor: toFloorDto(w.floor),
  };
}

// --- beds ---------------------------------------------------------------

/**
 * Everything a bed's DTO needs: its type, where it sits, and — the one thing
 * never stored — whoever is lying in it right now, read off the single open
 * bed assignment (`toAt = null`).
 */
export const bedInclude = {
  bedType: true,
  ward: { include: { floor: true } },
  assignments: {
    where: { toAt: null },
    include: {
      admission: {
        select: {
          id: true,
          admissionNo: true,
          admittedAt: true,
          patient: {
            select: { id: true, firstName: true, lastName: true, mrn: true },
          },
        },
      },
    },
  },
} as const;

export type BedRow = Prisma.BedGetPayload<{ include: typeof bedInclude }>;

export function toBedDto(b: BedRow): BedDto {
  const open = b.assignments[0] ?? null;
  const occupant = open
    ? {
        admissionId: open.admission.id,
        admissionNo: open.admission.admissionNo,
        patientId: open.admission.patient.id,
        patientName: `${open.admission.patient.firstName} ${open.admission.patient.lastName}`,
        mrn: open.admission.patient.mrn,
        admittedAt: open.admission.admittedAt.toISOString(),
      }
    : null;

  return {
    id: b.id,
    name: b.name,
    isActive: b.isActive,
    isBlocked: b.isBlocked,
    blockReason: b.blockReason,
    blockNote: b.blockNote,
    bedType: toBedTypeDto(b.bedType),
    ward: {
      id: b.ward.id,
      name: b.ward.name,
      floor: { id: b.ward.floor.id, name: b.ward.floor.name },
    },
    status: bedStatusOf({
      isBlocked: b.isBlocked,
      occupantAdmissionId: occupant?.admissionId ?? null,
    }),
    occupant,
  };
}

// --- board ------------------------------------------------------------

/**
 * One query set for the whole board: floors -> active wards -> active beds,
 * each bed carrying its open assignment. No per-bed round trip.
 */
export const boardFloorInclude = {
  wards: {
    where: { isActive: true },
    orderBy: { name: 'asc' },
    include: {
      beds: {
        where: { isActive: true },
        orderBy: { name: 'asc' },
        include: bedInclude,
      },
    },
  },
} as const;

export type BoardFloorRow = Prisma.FloorGetPayload<{
  include: typeof boardFloorInclude;
}>;

export function toBedBoard(floors: BoardFloorRow[]): BedBoard {
  const totals: Record<BedStatus, number> & { total: number } = {
    total: 0,
    occupied: 0,
    available: 0,
    blocked: 0,
  };

  const floorDtos = floors.map((f) => ({
    id: f.id,
    name: f.name,
    wards: f.wards.map((w) => ({
      id: w.id,
      name: w.name,
      beds: w.beds.map((bed) => {
        const dto = toBedDto(bed);
        totals.total += 1;
        totals[dto.status] += 1;
        return dto;
      }),
    })),
  }));

  return { totals, floors: floorDtos };
}
