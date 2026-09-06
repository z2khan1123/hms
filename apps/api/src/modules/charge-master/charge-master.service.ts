import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  ChargeCategory,
  Prisma,
  TaxCategory,
  UnitType,
} from '@prisma/client';
import type {
  ChargeCategory as ChargeCategoryDto,
  Charge as ChargeDto,
  ChargeTypeKind,
  CreateChargeCategoryInput,
  CreateChargeInput,
  TaxCategory as TaxCategoryDto,
  UnitType as UnitTypeDto,
  UpdateChargeInput,
} from '@hms/shared';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface UpdateChargeCategoryInput
  extends Partial<CreateChargeCategoryInput> {
  isActive?: boolean;
}
export interface CreateUnitTypeInput {
  name: string;
}
export interface UpdateUnitTypeInput {
  name?: string;
  isActive?: boolean;
}
export interface CreateTaxCategoryInput {
  name: string;
  rateBps: number;
}
export interface UpdateTaxCategoryInput {
  name?: string;
  rateBps?: number;
  isActive?: boolean;
}

export interface ChargeListFilter {
  chargeType?: ChargeTypeKind;
  chargeCategoryId?: string;
  q?: string;
  includeInactive?: boolean;
}

export interface CategoryListFilter {
  chargeType?: ChargeTypeKind;
  includeInactive?: boolean;
}

/** The relations `chargeSchema` needs. */
export const chargeInclude = {
  chargeCategory: true,
  unitType: true,
  taxCategory: true,
} as const;

export type ChargeRow = Prisma.ChargeGetPayload<{
  include: typeof chargeInclude;
}>;

@Injectable()
export class ChargeMasterService {
  constructor(private readonly prisma: PrismaService) {}

  // --- charge categories ---------------------------------------------------

  async createCategory(
    tenantId: string,
    input: CreateChargeCategoryInput,
  ): Promise<ChargeCategoryDto> {
    const created = await this.prisma.chargeCategory.create({
      data: { tenantId, name: input.name, chargeType: input.chargeType },
    });
    return toCategoryDto(created);
  }

  async listCategories(
    tenantId: string,
    filter: CategoryListFilter,
  ): Promise<ChargeCategoryDto[]> {
    const rows = await this.prisma.chargeCategory.findMany({
      where: {
        tenantId,
        chargeType: filter.chargeType,
        ...(filter.includeInactive ? {} : { isActive: true }),
      },
      orderBy: [{ chargeType: 'asc' }, { name: 'asc' }],
    });
    return rows.map(toCategoryDto);
  }

  async updateCategory(
    tenantId: string,
    id: string,
    input: UpdateChargeCategoryInput,
  ): Promise<ChargeCategoryDto> {
    await this.findCategoryOrThrow(tenantId, id);
    const updated = await this.prisma.chargeCategory.update({
      where: { id },
      data: {
        name: input.name,
        chargeType: input.chargeType,
        isActive: input.isActive,
      },
    });
    return toCategoryDto(updated);
  }

  async deactivateCategory(
    tenantId: string,
    id: string,
  ): Promise<ChargeCategoryDto> {
    await this.findCategoryOrThrow(tenantId, id);
    const updated = await this.prisma.chargeCategory.update({
      where: { id },
      data: { isActive: false },
    });
    return toCategoryDto(updated);
  }

  // --- unit types ----------------------------------------------------------

  async createUnitType(
    tenantId: string,
    input: CreateUnitTypeInput,
  ): Promise<UnitTypeDto> {
    const created = await this.prisma.unitType.create({
      data: { tenantId, name: input.name },
    });
    return toUnitTypeDto(created);
  }

  async listUnitTypes(
    tenantId: string,
    includeInactive?: boolean,
  ): Promise<UnitTypeDto[]> {
    const rows = await this.prisma.unitType.findMany({
      where: { tenantId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: { name: 'asc' },
    });
    return rows.map(toUnitTypeDto);
  }

  async updateUnitType(
    tenantId: string,
    id: string,
    input: UpdateUnitTypeInput,
  ): Promise<UnitTypeDto> {
    await this.findUnitTypeOrThrow(tenantId, id);
    const updated = await this.prisma.unitType.update({
      where: { id },
      data: { name: input.name, isActive: input.isActive },
    });
    return toUnitTypeDto(updated);
  }

  async deactivateUnitType(tenantId: string, id: string): Promise<UnitTypeDto> {
    await this.findUnitTypeOrThrow(tenantId, id);
    const updated = await this.prisma.unitType.update({
      where: { id },
      data: { isActive: false },
    });
    return toUnitTypeDto(updated);
  }

  // --- tax categories ------------------------------------------------------

  async createTaxCategory(
    tenantId: string,
    input: CreateTaxCategoryInput,
  ): Promise<TaxCategoryDto> {
    const created = await this.prisma.taxCategory.create({
      data: { tenantId, name: input.name, rateBps: input.rateBps },
    });
    return toTaxCategoryDto(created);
  }

  async listTaxCategories(
    tenantId: string,
    includeInactive?: boolean,
  ): Promise<TaxCategoryDto[]> {
    const rows = await this.prisma.taxCategory.findMany({
      where: { tenantId, ...(includeInactive ? {} : { isActive: true }) },
      orderBy: { rateBps: 'asc' },
    });
    return rows.map(toTaxCategoryDto);
  }

  async updateTaxCategory(
    tenantId: string,
    id: string,
    input: UpdateTaxCategoryInput,
  ): Promise<TaxCategoryDto> {
    await this.findTaxCategoryOrThrow(tenantId, id);
    const updated = await this.prisma.taxCategory.update({
      where: { id },
      data: {
        name: input.name,
        rateBps: input.rateBps,
        isActive: input.isActive,
      },
    });
    return toTaxCategoryDto(updated);
  }

  async deactivateTaxCategory(
    tenantId: string,
    id: string,
  ): Promise<TaxCategoryDto> {
    await this.findTaxCategoryOrThrow(tenantId, id);
    const updated = await this.prisma.taxCategory.update({
      where: { id },
      data: { isActive: false },
    });
    return toTaxCategoryDto(updated);
  }

  // --- charges -------------------------------------------------------------

  async createCharge(
    tenantId: string,
    input: CreateChargeInput,
  ): Promise<ChargeDto> {
    await this.assertRefs(tenantId, input);
    const created = await this.prisma.charge.create({
      data: {
        tenantId,
        chargeCategoryId: input.chargeCategoryId,
        unitTypeId: input.unitTypeId ?? null,
        taxCategoryId: input.taxCategoryId ?? null,
        name: input.name,
        standardChargeMinor: input.standardChargeMinor,
        description: input.description ?? null,
      },
      include: chargeInclude,
    });
    return toChargeDto(created);
  }

  async listCharges(
    tenantId: string,
    filter: ChargeListFilter,
  ): Promise<ChargeDto[]> {
    const rows = await this.prisma.charge.findMany({
      where: {
        tenantId,
        chargeCategoryId: filter.chargeCategoryId,
        ...(filter.includeInactive ? {} : { isActive: true }),
        ...(filter.chargeType
          ? { chargeCategory: { chargeType: filter.chargeType } }
          : {}),
        ...(filter.q
          ? {
              OR: [
                { name: { contains: filter.q, mode: 'insensitive' } },
                { description: { contains: filter.q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: chargeInclude,
      orderBy: { name: 'asc' },
      take: 500,
    });
    return rows.map(toChargeDto);
  }

  async getCharge(tenantId: string, id: string): Promise<ChargeDto> {
    return toChargeDto(await this.findChargeOrThrow(tenantId, id));
  }

  async updateCharge(
    tenantId: string,
    id: string,
    input: UpdateChargeInput,
  ): Promise<ChargeDto> {
    await this.findChargeOrThrow(tenantId, id);
    await this.assertRefs(tenantId, input);
    const updated = await this.prisma.charge.update({
      where: { id },
      data: {
        chargeCategoryId: input.chargeCategoryId,
        unitTypeId: input.unitTypeId,
        taxCategoryId: input.taxCategoryId,
        name: input.name,
        standardChargeMinor: input.standardChargeMinor,
        description: input.description,
        isActive: input.isActive,
      },
      include: chargeInclude,
    });
    return toChargeDto(updated);
  }

  /** Charge items snapshot their charge, so retiring one never rewrites history. */
  async deactivateCharge(tenantId: string, id: string): Promise<ChargeDto> {
    await this.findChargeOrThrow(tenantId, id);
    const updated = await this.prisma.charge.update({
      where: { id },
      data: { isActive: false },
      include: chargeInclude,
    });
    return toChargeDto(updated);
  }

  // --- lookups -------------------------------------------------------------

  /** Used by OPD registration and billing when they need the charge master row. */
  async findChargeOrThrow(tenantId: string, id: string): Promise<ChargeRow> {
    const found = await this.prisma.charge.findFirst({
      where: { id, tenantId },
      include: chargeInclude,
    });
    if (!found) throw new NotFoundException('Charge not found');
    return found;
  }

  private async assertRefs(
    tenantId: string,
    input: Partial<CreateChargeInput>,
  ): Promise<void> {
    if (input.chargeCategoryId) {
      await this.findCategoryOrThrow(tenantId, input.chargeCategoryId);
    }
    if (input.unitTypeId) {
      const found = await this.prisma.unitType.findFirst({
        where: { id: input.unitTypeId, tenantId },
        select: { id: true },
      });
      if (!found) throw new BadRequestException('Unknown unit type');
    }
    if (input.taxCategoryId) {
      const found = await this.prisma.taxCategory.findFirst({
        where: { id: input.taxCategoryId, tenantId },
        select: { id: true },
      });
      if (!found) throw new BadRequestException('Unknown tax category');
    }
  }

  private async findCategoryOrThrow(
    tenantId: string,
    id: string,
  ): Promise<ChargeCategory> {
    const found = await this.prisma.chargeCategory.findFirst({
      where: { id, tenantId },
    });
    if (!found) throw new NotFoundException('Charge category not found');
    return found;
  }

  private async findUnitTypeOrThrow(
    tenantId: string,
    id: string,
  ): Promise<UnitType> {
    const found = await this.prisma.unitType.findFirst({
      where: { id, tenantId },
    });
    if (!found) throw new NotFoundException('Unit type not found');
    return found;
  }

  private async findTaxCategoryOrThrow(
    tenantId: string,
    id: string,
  ): Promise<TaxCategory> {
    const found = await this.prisma.taxCategory.findFirst({
      where: { id, tenantId },
    });
    if (!found) throw new NotFoundException('Tax category not found');
    return found;
  }
}

export function toCategoryDto(c: ChargeCategory): ChargeCategoryDto {
  return {
    id: c.id,
    name: c.name,
    chargeType: c.chargeType,
    isActive: c.isActive,
  };
}

export function toUnitTypeDto(u: UnitType): UnitTypeDto {
  return { id: u.id, name: u.name, isActive: u.isActive };
}

export function toTaxCategoryDto(t: TaxCategory): TaxCategoryDto {
  return {
    id: t.id,
    name: t.name,
    rateBps: t.rateBps,
    isActive: t.isActive,
  };
}

export function toChargeDto(c: ChargeRow): ChargeDto {
  return {
    id: c.id,
    name: c.name,
    standardChargeMinor: c.standardChargeMinor,
    description: c.description,
    isActive: c.isActive,
    chargeCategory: toCategoryDto(c.chargeCategory),
    unitType: c.unitType ? toUnitTypeDto(c.unitType) : null,
    taxCategory: c.taxCategory ? toTaxCategoryDto(c.taxCategory) : null,
  };
}
