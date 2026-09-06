import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { BedBlockReason } from '@prisma/client';
import type {
  Bed as BedDto,
  BedBoard,
  BedStatus,
  BedType as BedTypeDto,
  CreateBedRangeInput,
  Floor as FloorDto,
  Ward as WardDto,
} from '@hms/shared';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  bedInclude,
  boardFloorInclude,
  toBedBoard,
  toBedDto,
  toBedTypeDto,
  toFloorDto,
  toWardDto,
  wardInclude,
} from './wards.mapper.js';

export interface BedListFilter {
  wardId?: string;
  status?: BedStatus;
  includeInactive?: boolean;
}

interface FloorBody {
  name: string;
  sortOrder?: number;
  isActive?: boolean;
}
interface BedTypeBody {
  name: string;
  defaultNightlyRateMinor?: number | null;
  isActive?: boolean;
}
interface WardBody {
  floorId: string;
  name: string;
  isActive?: boolean;
}
interface BedBody {
  wardId: string;
  bedTypeId: string;
  name: string;
  isActive?: boolean;
}
interface BlockBody {
  reason: BedBlockReason;
  note?: string;
}

type DeleteResult = { id: string; softDeleted: boolean };

const LIST_LIMIT = 2000;

@Injectable()
export class WardsService {
  constructor(private readonly prisma: PrismaService) {}

  // --- floors ----------------------------------------------------------

  async listFloors(tenantId: string): Promise<FloorDto[]> {
    const rows = await this.prisma.floor.findMany({
      where: { tenantId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toFloorDto);
  }

  async createFloor(tenantId: string, input: FloorBody): Promise<FloorDto> {
    await this.assertNameFree('floor', tenantId, input.name);
    const created = await this.prisma.floor.create({
      data: { tenantId, name: input.name, sortOrder: input.sortOrder ?? 0 },
    });
    return toFloorDto(created);
  }

  async updateFloor(
    tenantId: string,
    id: string,
    input: Partial<FloorBody>,
  ): Promise<FloorDto> {
    await this.findFloor(tenantId, id);
    const updated = await this.prisma.floor.update({
      where: { id },
      data: {
        name: input.name,
        sortOrder: input.sortOrder,
        isActive: input.isActive,
      },
    });
    return toFloorDto(updated);
  }

  /** Soft delete while wards still hang off it; hard delete when nothing does. */
  async removeFloor(tenantId: string, id: string): Promise<DeleteResult> {
    await this.findFloor(tenantId, id);
    const wards = await this.prisma.ward.count({
      where: { tenantId, floorId: id },
    });
    if (wards > 0) {
      await this.prisma.floor.update({
        where: { id },
        data: { isActive: false },
      });
      return { id, softDeleted: true };
    }
    await this.prisma.floor.delete({ where: { id } });
    return { id, softDeleted: false };
  }

  // --- bed types -----------------------------------------------------

  async listBedTypes(tenantId: string): Promise<BedTypeDto[]> {
    const rows = await this.prisma.bedType.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
    return rows.map(toBedTypeDto);
  }

  async createBedType(
    tenantId: string,
    input: BedTypeBody,
  ): Promise<BedTypeDto> {
    await this.assertNameFree('bedType', tenantId, input.name);
    const created = await this.prisma.bedType.create({
      data: {
        tenantId,
        name: input.name,
        defaultNightlyRateMinor: input.defaultNightlyRateMinor ?? null,
      },
    });
    return toBedTypeDto(created);
  }

  async updateBedType(
    tenantId: string,
    id: string,
    input: Partial<BedTypeBody>,
  ): Promise<BedTypeDto> {
    await this.findBedType(tenantId, id);
    const updated = await this.prisma.bedType.update({
      where: { id },
      data: {
        name: input.name,
        defaultNightlyRateMinor: input.defaultNightlyRateMinor,
        isActive: input.isActive,
      },
    });
    return toBedTypeDto(updated);
  }

  async removeBedType(tenantId: string, id: string): Promise<DeleteResult> {
    await this.findBedType(tenantId, id);
    const inUse = await this.prisma.bed.count({
      where: { tenantId, bedTypeId: id },
    });
    if (inUse > 0) {
      await this.prisma.bedType.update({
        where: { id },
        data: { isActive: false },
      });
      return { id, softDeleted: true };
    }
    await this.prisma.bedType.delete({ where: { id } });
    return { id, softDeleted: false };
  }

  // --- wards --------------------------------------------------------

  async listWards(tenantId: string): Promise<WardDto[]> {
    const rows = await this.prisma.ward.findMany({
      where: { tenantId },
      include: wardInclude,
      orderBy: [{ floor: { sortOrder: 'asc' } }, { name: 'asc' }],
    });
    return rows.map(toWardDto);
  }

  async createWard(tenantId: string, input: WardBody): Promise<WardDto> {
    await this.findFloor(tenantId, input.floorId);
    await this.assertNameFree('ward', tenantId, input.name);
    const created = await this.prisma.ward.create({
      data: { tenantId, floorId: input.floorId, name: input.name },
      include: wardInclude,
    });
    return toWardDto(created);
  }

  async updateWard(
    tenantId: string,
    id: string,
    input: Partial<WardBody>,
  ): Promise<WardDto> {
    await this.findWard(tenantId, id);
    if (input.floorId) await this.findFloor(tenantId, input.floorId);
    const updated = await this.prisma.ward.update({
      where: { id },
      data: {
        floorId: input.floorId,
        name: input.name,
        isActive: input.isActive,
      },
      include: wardInclude,
    });
    return toWardDto(updated);
  }

  async removeWard(tenantId: string, id: string): Promise<DeleteResult> {
    await this.findWard(tenantId, id);
    const beds = await this.prisma.bed.count({ where: { tenantId, wardId: id } });
    if (beds > 0) {
      await this.prisma.ward.update({
        where: { id },
        data: { isActive: false },
      });
      return { id, softDeleted: true };
    }
    await this.prisma.ward.delete({ where: { id } });
    return { id, softDeleted: false };
  }

  // --- beds -------------------------------------------------------

  async listBeds(
    tenantId: string,
    filter: BedListFilter,
  ): Promise<BedDto[]> {
    const rows = await this.prisma.bed.findMany({
      where: {
        tenantId,
        wardId: filter.wardId,
        ...(filter.includeInactive ? {} : { isActive: true }),
      },
      include: bedInclude,
      orderBy: [{ ward: { name: 'asc' } }, { name: 'asc' }],
      take: LIST_LIMIT,
    });
    const dtos = rows.map(toBedDto);
    return filter.status
      ? dtos.filter((b) => b.status === filter.status)
      : dtos;
  }

  async getBed(tenantId: string, id: string): Promise<BedDto> {
    const bed = await this.prisma.bed.findFirst({
      where: { id, tenantId },
      include: bedInclude,
    });
    if (!bed) throw new NotFoundException('Bed not found');
    return toBedDto(bed);
  }

  async createBed(tenantId: string, input: BedBody): Promise<BedDto> {
    await this.assertWard(tenantId, input.wardId);
    await this.assertBedType(tenantId, input.bedTypeId);
    await this.assertNameFree('bed', tenantId, input.name);
    const created = await this.prisma.bed.create({
      data: {
        tenantId,
        wardId: input.wardId,
        bedTypeId: input.bedTypeId,
        name: input.name,
      },
    });
    return this.getBed(tenantId, created.id);
  }

  /**
   * Bulk bed creation: `to - from + 1` names, `prefix` + zero-padded number.
   * Names already taken are skipped rather than failing the batch; the caller
   * is told how many landed and how many were skipped.
   */
  async createBedRange(
    tenantId: string,
    input: CreateBedRangeInput,
  ): Promise<{ created: number; skipped: number; beds: BedDto[] }> {
    await this.assertWard(tenantId, input.wardId);
    await this.assertBedType(tenantId, input.bedTypeId);
    if (input.to < input.from) {
      throw new BadRequestException('`to` must be greater than or equal to `from`');
    }

    const names: string[] = [];
    for (let n = input.from; n <= input.to; n += 1) {
      names.push(`${input.prefix}${String(n).padStart(input.pad ?? 0, '0')}`);
    }

    const existing = await this.prisma.bed.findMany({
      where: { tenantId, name: { in: names } },
      select: { name: true },
    });
    const taken = new Set(existing.map((b) => b.name));
    const fresh = names.filter((name) => !taken.has(name));

    if (fresh.length > 0) {
      await this.prisma.bed.createMany({
        data: fresh.map((name) => ({
          tenantId,
          wardId: input.wardId,
          bedTypeId: input.bedTypeId,
          name,
        })),
        skipDuplicates: true,
      });
    }

    const beds = await this.prisma.bed.findMany({
      where: { tenantId, name: { in: names } },
      include: bedInclude,
      orderBy: { name: 'asc' },
    });

    return {
      created: fresh.length,
      skipped: names.length - fresh.length,
      beds: beds.map(toBedDto),
    };
  }

  async updateBed(
    tenantId: string,
    id: string,
    input: Partial<BedBody>,
  ): Promise<BedDto> {
    await this.findBed(tenantId, id);
    if (input.wardId) await this.assertWard(tenantId, input.wardId);
    if (input.bedTypeId) await this.assertBedType(tenantId, input.bedTypeId);
    await this.prisma.bed.update({
      where: { id },
      data: {
        wardId: input.wardId,
        bedTypeId: input.bedTypeId,
        name: input.name,
        isActive: input.isActive,
      },
    });
    return this.getBed(tenantId, id);
  }

  /** Soft delete once the bed has any assignment history; hard delete otherwise. */
  async removeBed(tenantId: string, id: string): Promise<DeleteResult> {
    await this.findBed(tenantId, id);
    const refs = await this.prisma.bedAssignment.count({
      where: { tenantId, bedId: id },
    });
    if (refs > 0) {
      await this.prisma.bed.update({
        where: { id },
        data: { isActive: false },
      });
      return { id, softDeleted: true };
    }
    await this.prisma.bed.delete({ where: { id } });
    return { id, softDeleted: false };
  }

  async blockBed(
    tenantId: string,
    id: string,
    input: BlockBody,
  ): Promise<BedDto> {
    await this.findBed(tenantId, id);
    await this.prisma.bed.update({
      where: { id },
      data: {
        isBlocked: true,
        blockReason: input.reason,
        blockNote: input.note ?? null,
      },
    });
    return this.getBed(tenantId, id);
  }

  async unblockBed(tenantId: string, id: string): Promise<BedDto> {
    await this.findBed(tenantId, id);
    await this.prisma.bed.update({
      where: { id },
      data: { isBlocked: false, blockReason: null, blockNote: null },
    });
    return this.getBed(tenantId, id);
  }

  // --- board ----------------------------------------------------

  async board(tenantId: string): Promise<BedBoard> {
    const floors = await this.prisma.floor.findMany({
      where: { tenantId, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: boardFloorInclude,
    });
    return toBedBoard(floors);
  }

  // --- lookups ------------------------------------------------

  private async findFloor(tenantId: string, id: string) {
    const found = await this.prisma.floor.findFirst({ where: { id, tenantId } });
    if (!found) throw new NotFoundException('Floor not found');
    return found;
  }

  private async findBedType(tenantId: string, id: string) {
    const found = await this.prisma.bedType.findFirst({
      where: { id, tenantId },
    });
    if (!found) throw new NotFoundException('Bed type not found');
    return found;
  }

  private async findWard(tenantId: string, id: string) {
    const found = await this.prisma.ward.findFirst({ where: { id, tenantId } });
    if (!found) throw new NotFoundException('Ward not found');
    return found;
  }

  private async findBed(tenantId: string, id: string) {
    const found = await this.prisma.bed.findFirst({ where: { id, tenantId } });
    if (!found) throw new NotFoundException('Bed not found');
    return found;
  }

  private async assertWard(tenantId: string, id: string): Promise<void> {
    const found = await this.prisma.ward.findFirst({
      where: { id, tenantId, isActive: true },
      select: { id: true },
    });
    if (!found) throw new BadRequestException('Unknown ward');
  }

  private async assertBedType(tenantId: string, id: string): Promise<void> {
    const found = await this.prisma.bedType.findFirst({
      where: { id, tenantId, isActive: true },
      select: { id: true },
    });
    if (!found) throw new BadRequestException('Unknown bed type');
  }

  private async assertNameFree(
    entity: 'floor' | 'bedType' | 'ward' | 'bed',
    tenantId: string,
    name: string,
  ): Promise<void> {
    const label = {
      floor: 'A floor',
      bedType: 'A bed type',
      ward: 'A ward',
      bed: 'A bed',
    }[entity];
    const where = { tenantId, name };
    const clash =
      entity === 'floor'
        ? await this.prisma.floor.findFirst({ where, select: { id: true } })
        : entity === 'bedType'
          ? await this.prisma.bedType.findFirst({ where, select: { id: true } })
          : entity === 'ward'
            ? await this.prisma.ward.findFirst({ where, select: { id: true } })
            : await this.prisma.bed.findFirst({ where, select: { id: true } });
    if (clash) {
      throw new ConflictException(`${label} with that name already exists`);
    }
  }
}
