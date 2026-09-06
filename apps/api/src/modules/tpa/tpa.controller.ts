import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  type CreateTpaInput,
  createTpaSchema,
  updateTpaSchema,
} from '@hms/shared';
import { z } from 'zod';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { Permissions } from '../../common/auth/permissions.decorator.js';
import { requireTenant } from '../../common/auth/require-tenant.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import {
  TpaService,
  type TpaListFilter,
  type UpdateTpaInput,
} from './tpa.service.js';

const listQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  includeInactive: z.coerce.boolean().optional(),
});

@Controller('tpa')
export class TpaController {
  constructor(private readonly tpa: TpaService) {}

  @Get()
  @Permissions('tpa:read')
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listQuerySchema)) query: TpaListFilter,
  ) {
    return this.tpa.list(requireTenant(user), query);
  }

  @Get(':id')
  @Permissions('tpa:read')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tpa.get(requireTenant(user), id);
  }

  @Post()
  @Permissions('tpa:manage')
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createTpaSchema)) dto: CreateTpaInput,
  ) {
    return this.tpa.create(requireTenant(user), dto);
  }

  @Patch(':id')
  @Permissions('tpa:manage')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateTpaSchema)) dto: UpdateTpaInput,
  ) {
    return this.tpa.update(requireTenant(user), id, dto);
  }

  @Delete(':id')
  @Permissions('tpa:manage')
  deactivate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.tpa.deactivate(requireTenant(user), id);
  }
}
