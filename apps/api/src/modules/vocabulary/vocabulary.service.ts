import { Injectable, NotFoundException } from '@nestjs/common';
import type { Finding, Prisma, SymptomType } from '@prisma/client';
import type {
  Finding as FindingDto,
  Icd10Code as Icd10CodeDto,
  Symptom as SymptomDto,
} from '@hms/shared';
import { PrismaService } from '../../prisma/prisma.service.js';

export interface SymptomTypeInput {
  name: string;
}
export interface CreateSymptomInput {
  symptomTypeId: string;
  title: string;
  description?: string;
}
export interface UpdateSymptomInput {
  symptomTypeId?: string;
  title?: string;
  description?: string;
}
export interface CreateFindingInput {
  title: string;
  category?: string;
  description?: string;
}
export type UpdateFindingInput = Partial<CreateFindingInput>;

export interface SymptomListFilter {
  symptomTypeId?: string;
  q?: string;
}
export interface FindingListFilter {
  category?: string;
  q?: string;
}
export interface Icd10SearchFilter {
  groupId?: string;
  q?: string;
}

export interface Icd10GroupDto {
  id: string;
  name: string;
}

const symptomInclude = { symptomType: true } as const;
type SymptomRow = Prisma.SymptomGetPayload<{ include: typeof symptomInclude }>;

const icd10Include = { group: true } as const;
type Icd10Row = Prisma.Icd10CodeGetPayload<{ include: typeof icd10Include }>;

const SEARCH_LIMIT = 200;

@Injectable()
export class VocabularyService {
  constructor(private readonly prisma: PrismaService) {}

  // --- symptom types -------------------------------------------------------

  async listSymptomTypes(
    tenantId: string,
  ): Promise<{ id: string; name: string }[]> {
    const rows = await this.prisma.symptomType.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => ({ id: r.id, name: r.name }));
  }

  async createSymptomType(
    tenantId: string,
    input: SymptomTypeInput,
  ): Promise<{ id: string; name: string }> {
    const created = await this.prisma.symptomType.create({
      data: { tenantId, name: input.name },
    });
    return { id: created.id, name: created.name };
  }

  async updateSymptomType(
    tenantId: string,
    id: string,
    input: SymptomTypeInput,
  ): Promise<{ id: string; name: string }> {
    await this.findSymptomTypeOrThrow(tenantId, id);
    const updated = await this.prisma.symptomType.update({
      where: { id },
      data: { name: input.name },
    });
    return { id: updated.id, name: updated.name };
  }

  async removeSymptomType(tenantId: string, id: string): Promise<void> {
    await this.findSymptomTypeOrThrow(tenantId, id);
    await this.prisma.symptomType.delete({ where: { id } });
  }

  // --- symptoms ------------------------------------------------------------

  async listSymptoms(
    tenantId: string,
    filter: SymptomListFilter,
  ): Promise<SymptomDto[]> {
    const rows = await this.prisma.symptom.findMany({
      where: {
        tenantId,
        symptomTypeId: filter.symptomTypeId,
        ...(filter.q
          ? { title: { contains: filter.q, mode: 'insensitive' } }
          : {}),
      },
      include: symptomInclude,
      orderBy: { title: 'asc' },
      take: SEARCH_LIMIT,
    });
    return rows.map(toSymptomDto);
  }

  async createSymptom(
    tenantId: string,
    input: CreateSymptomInput,
  ): Promise<SymptomDto> {
    await this.findSymptomTypeOrThrow(tenantId, input.symptomTypeId);
    const created = await this.prisma.symptom.create({
      data: {
        tenantId,
        symptomTypeId: input.symptomTypeId,
        title: input.title,
        description: input.description ?? null,
      },
      include: symptomInclude,
    });
    return toSymptomDto(created);
  }

  async updateSymptom(
    tenantId: string,
    id: string,
    input: UpdateSymptomInput,
  ): Promise<SymptomDto> {
    await this.assertSymptomExists(tenantId, id);
    if (input.symptomTypeId) {
      await this.findSymptomTypeOrThrow(tenantId, input.symptomTypeId);
    }
    const updated = await this.prisma.symptom.update({
      where: { id },
      data: {
        symptomTypeId: input.symptomTypeId,
        title: input.title,
        description: input.description,
      },
      include: symptomInclude,
    });
    return toSymptomDto(updated);
  }

  async removeSymptom(tenantId: string, id: string): Promise<void> {
    await this.assertSymptomExists(tenantId, id);
    await this.prisma.symptom.delete({ where: { id } });
  }

  // --- findings ------------------------------------------------------------

  async listFindings(
    tenantId: string,
    filter: FindingListFilter,
  ): Promise<FindingDto[]> {
    const rows = await this.prisma.finding.findMany({
      where: {
        tenantId,
        category: filter.category,
        ...(filter.q
          ? { title: { contains: filter.q, mode: 'insensitive' } }
          : {}),
      },
      orderBy: [{ category: 'asc' }, { title: 'asc' }],
      take: SEARCH_LIMIT,
    });
    return rows.map(toFindingDto);
  }

  async createFinding(
    tenantId: string,
    input: CreateFindingInput,
  ): Promise<FindingDto> {
    const created = await this.prisma.finding.create({
      data: {
        tenantId,
        title: input.title,
        category: input.category ?? null,
        description: input.description ?? null,
      },
    });
    return toFindingDto(created);
  }

  async updateFinding(
    tenantId: string,
    id: string,
    input: UpdateFindingInput,
  ): Promise<FindingDto> {
    await this.findFindingOrThrow(tenantId, id);
    const updated = await this.prisma.finding.update({
      where: { id },
      data: {
        title: input.title,
        category: input.category,
        description: input.description,
      },
    });
    return toFindingDto(updated);
  }

  async removeFinding(tenantId: string, id: string): Promise<void> {
    await this.findFindingOrThrow(tenantId, id);
    await this.prisma.finding.delete({ where: { id } });
  }

  // --- ICD-10 (global reference data — deliberately not tenant-scoped) ------

  async listIcd10Groups(): Promise<Icd10GroupDto[]> {
    const rows = await this.prisma.icd10Group.findMany({
      orderBy: { name: 'asc' },
    });
    return rows.map((g) => ({ id: g.id, name: g.name }));
  }

  async searchIcd10Codes(filter: Icd10SearchFilter): Promise<Icd10CodeDto[]> {
    const rows = await this.prisma.icd10Code.findMany({
      where: {
        groupId: filter.groupId,
        ...(filter.q
          ? {
              OR: [
                { code: { contains: filter.q, mode: 'insensitive' } },
                { title: { contains: filter.q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: icd10Include,
      orderBy: { code: 'asc' },
      take: SEARCH_LIMIT,
    });
    return rows.map(toIcd10Dto);
  }

  // --- helpers -------------------------------------------------------------

  private async findSymptomTypeOrThrow(
    tenantId: string,
    id: string,
  ): Promise<SymptomType> {
    const found = await this.prisma.symptomType.findFirst({
      where: { id, tenantId },
    });
    if (!found) throw new NotFoundException('Symptom type not found');
    return found;
  }

  private async assertSymptomExists(
    tenantId: string,
    id: string,
  ): Promise<void> {
    const found = await this.prisma.symptom.findFirst({
      where: { id, tenantId },
      select: { id: true },
    });
    if (!found) throw new NotFoundException('Symptom not found');
  }

  private async findFindingOrThrow(
    tenantId: string,
    id: string,
  ): Promise<Finding> {
    const found = await this.prisma.finding.findFirst({
      where: { id, tenantId },
    });
    if (!found) throw new NotFoundException('Finding not found');
    return found;
  }
}

function toSymptomDto(s: SymptomRow): SymptomDto {
  return {
    id: s.id,
    title: s.title,
    description: s.description,
    symptomType: { id: s.symptomType.id, name: s.symptomType.name },
  };
}

function toFindingDto(f: Finding): FindingDto {
  return {
    id: f.id,
    title: f.title,
    description: f.description,
    category: f.category,
  };
}

export function toIcd10Dto(c: Icd10Row): Icd10CodeDto {
  return {
    id: c.id,
    code: c.code,
    title: c.title,
    group: { id: c.group.id, name: c.group.name },
  };
}
