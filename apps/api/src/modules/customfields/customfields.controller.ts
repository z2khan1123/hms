import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import {
  type CreateCustomFieldInput,
  type CustomEntity,
  type SaveCustomValuesInput,
  type UpdateCustomFieldInput,
  createCustomFieldSchema,
  customEntitySchema,
  customFieldListQuerySchema,
  saveCustomValuesSchema,
  updateCustomFieldSchema,
} from '@hms/shared';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { Permissions } from '../../common/auth/permissions.decorator.js';
import { requireTenant } from '../../common/auth/require-tenant.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { CustomFieldsService } from './customfields.service.js';

type ListQuery = z.infer<typeof customFieldListQuerySchema>;
const entityParamSchema = z.object({ entity: customEntitySchema });

/**
 * Defining a field is a setup job and needs `customfield:manage`. READING the
 * fields on a record needs nothing extra — if you are allowed to see the
 * patient, you are allowed to see the patient's fields, and a second permission
 * would only ever be a way to show somebody half a record.
 */
@Controller('custom-fields')
export class CustomFieldsController {
  constructor(private readonly fields: CustomFieldsService) {}

  @Get()
  listDefinitions(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(customFieldListQuerySchema)) query: ListQuery,
  ) {
    return this.fields.list(
      requireTenant(user),
      query.entity,
      query.includeInactive ?? false,
    );
  }

  @Post()
  @Permissions('customfield:manage')
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createCustomFieldSchema))
    dto: CreateCustomFieldInput,
  ) {
    return this.fields.create(requireTenant(user), user.id, dto);
  }

  @Patch(':id')
  @Permissions('customfield:manage')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateCustomFieldSchema))
    dto: UpdateCustomFieldInput,
  ) {
    return this.fields.update(requireTenant(user), id, dto);
  }

  // --- values on a record -----------------------------------------

  @Get('values/:entity/:entityId')
  values(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(entityParamSchema)) params: { entity: CustomEntity },
    @Param('entityId', ParseUUIDPipe) entityId: string,
  ) {
    return this.fields.valuesFor(requireTenant(user), params.entity, entityId);
  }

  @Put('values/:entity/:entityId')
  saveValues(
    @CurrentUser() user: AuthUser,
    @Param(new ZodValidationPipe(entityParamSchema)) params: { entity: CustomEntity },
    @Param('entityId', ParseUUIDPipe) entityId: string,
    @Body(new ZodValidationPipe(saveCustomValuesSchema)) dto: SaveCustomValuesInput,
  ) {
    return this.fields.saveValues(
      requireTenant(user),
      user.id,
      params.entity,
      entityId,
      dto.values,
    );
  }
}
