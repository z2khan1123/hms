import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  type CreateCustomFieldInput,
  type CustomEntity,
  type CustomField,
  type CustomValue,
  type UpdateCustomFieldInput,
  validateCustomValues,
} from '@hms/shared';
import { PrismaService } from '../../prisma/prisma.service.js';

type DefinitionRow = {
  id: string;
  entity: CustomEntity;
  key: string;
  label: string;
  type: CustomField['type'];
  helpText: string | null;
  required: boolean;
  options: string[];
  sortOrder: number;
  isActive: boolean;
};

/**
 * User-defined fields.
 *
 * Two rules hold this together. A field's `key` never changes, because it is
 * what values are stored against — renaming it would orphan everything already
 * recorded. And retiring a field deactivates it rather than deleting it, so an
 * old record still shows what was true when it was written.
 */
@Injectable()
export class CustomFieldsService {
  constructor(private readonly prisma: PrismaService) {}

  // --- definitions ----------------------------------------------------

  async list(
    tenantId: string,
    entity?: CustomEntity,
    includeInactive = false,
  ): Promise<CustomField[]> {
    const rows = await this.prisma.customFieldDefinition.findMany({
      where: {
        tenantId,
        ...(entity ? { entity } : {}),
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: [{ entity: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
    });
    return rows.map(toDto);
  }

  async create(
    tenantId: string,
    createdById: string,
    input: CreateCustomFieldInput,
  ): Promise<CustomField> {
    const created = await this.prisma.customFieldDefinition
      .create({
        data: {
          tenantId,
          entity: input.entity,
          key: input.key,
          label: input.label,
          type: input.type,
          helpText: input.helpText ?? null,
          required: input.required ?? false,
          options: input.type === 'select' ? (input.options ?? []) : [],
          sortOrder: input.sortOrder ?? 0,
          createdById,
        },
      })
      .catch((e: unknown) => {
        if ((e as { code?: string }).code === 'P2002') {
          throw new ConflictException(
            `A field with the key "${input.key}" already exists on that record type`,
          );
        }
        throw e;
      });
    return toDto(created);
  }

  /**
   * Neither the key nor the entity can be changed — see the class comment.
   * Narrowing a choice list is allowed, and any value no longer in the list
   * simply fails validation the next time that record is saved, which is the
   * point at which somebody can actually fix it.
   */
  async update(
    tenantId: string,
    id: string,
    input: UpdateCustomFieldInput,
  ): Promise<CustomField> {
    const current = await this.find(tenantId, id);
    if (input.options && current.type !== 'select') {
      throw new BadRequestException('Only a choice field has options');
    }
    const updated = await this.prisma.customFieldDefinition.update({
      where: { id },
      data: {
        ...(input.label === undefined ? {} : { label: input.label }),
        ...(input.helpText === undefined ? {} : { helpText: input.helpText }),
        ...(input.required === undefined ? {} : { required: input.required }),
        ...(input.options === undefined ? {} : { options: input.options }),
        ...(input.sortOrder === undefined ? {} : { sortOrder: input.sortOrder }),
        ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      },
    });
    return toDto(updated);
  }

  // --- values ---------------------------------------------------------

  async valuesFor(
    tenantId: string,
    entity: CustomEntity,
    entityId: string,
  ): Promise<CustomValue[]> {
    const rows = await this.prisma.customFieldValue.findMany({
      where: { tenantId, entity, entityId },
      include: { definition: true },
    });
    return rows
      .filter((r) => r.definition.isActive)
      .map((r) => ({
        key: r.definition.key,
        value: cast(r.value, r.definition.type),
      }));
  }

  /**
   * Replace the whole set for one record.
   *
   * Validated with the same shared function the form uses, so a value the
   * screen accepted cannot be refused here and vice versa. Everything is
   * written in one transaction: a half-saved set of fields is worse than none.
   */
  async saveValues(
    tenantId: string,
    createdById: string,
    entity: CustomEntity,
    entityId: string,
    values: CustomValue[],
  ): Promise<CustomValue[]> {
    const fields = await this.list(tenantId, entity);
    const errors = validateCustomValues(fields, values);
    if (Object.keys(errors).length > 0) {
      throw new BadRequestException({
        message: 'Some fields are not valid',
        errors,
      });
    }

    const byKey = new Map(fields.map((f) => [f.key, f]));

    await this.prisma.$transaction(async (tx) => {
      for (const v of values) {
        const field = byKey.get(v.key);
        if (!field) continue;
        const stored =
          v.value === null || v.value === undefined || v.value === ''
            ? null
            : String(v.value);

        if (stored === null) {
          // Clearing a field removes the row rather than storing an empty
          // string, so "never answered" and "answered blank" stay the same
          // thing — there is no meaningful difference to a reader.
          await tx.customFieldValue.deleteMany({
            where: { definitionId: field.id, entityId },
          });
          continue;
        }

        await tx.customFieldValue.upsert({
          where: {
            definitionId_entityId: { definitionId: field.id, entityId },
          },
          create: {
            tenantId,
            definitionId: field.id,
            entity,
            entityId,
            value: stored,
            createdById,
          },
          update: { value: stored },
        });
      }
    });

    return this.valuesFor(tenantId, entity, entityId);
  }

  private async find(tenantId: string, id: string): Promise<DefinitionRow> {
    const row = await this.prisma.customFieldDefinition.findFirst({
      where: { id, tenantId },
    });
    if (!row) throw new NotFoundException('Field not found');
    return row;
  }
}

function toDto(r: DefinitionRow): CustomField {
  return {
    id: r.id,
    entity: r.entity,
    key: r.key,
    label: r.label,
    type: r.type,
    helpText: r.helpText,
    required: r.required,
    options: r.options,
    sortOrder: r.sortOrder,
    isActive: r.isActive,
  };
}

/** Text out of the column, back into the type the definition promises. */
function cast(value: string | null, type: CustomField['type']): CustomValue['value'] {
  if (value === null) return null;
  if (type === 'number') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  if (type === 'boolean') return value === 'true';
  return value;
}
