import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  type CreateOpdVisitInput,
  createOpdVisitSchema,
  opdListQuerySchema,
  type OpdVisitStatus,
  setOpdVisitStatusSchema,
  type UpdateOpdVisitInput,
  updateOpdVisitSchema,
} from '@hms/shared';
import { Audit } from '../../common/audit/audit.decorator.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { Permissions } from '../../common/auth/permissions.decorator.js';
import { requireTenant } from '../../common/auth/require-tenant.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { type OpdListFilter, OpdService } from './opd.service.js';

@Controller('opd')
export class OpdController {
  constructor(private readonly opd: OpdService) {}

  @Post()
  @Permissions('opd:create')
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createOpdVisitSchema)) dto: CreateOpdVisitInput,
  ) {
    return this.opd.create(requireTenant(user), user.id, dto);
  }

  @Get()
  @Permissions('opd:read')
  @Audit('opd.list')
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(opdListQuerySchema)) query: OpdListFilter,
  ) {
    return this.opd.list(requireTenant(user), query);
  }

  @Get(':id')
  @Permissions('opd:read')
  @Audit('opd.read')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.opd.get(requireTenant(user), id);
  }

  @Patch(':id')
  @Permissions('opd:update')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateOpdVisitSchema)) dto: UpdateOpdVisitInput,
  ) {
    return this.opd.update(requireTenant(user), id, dto);
  }

  @Patch(':id/status')
  @Permissions('opd:update')
  setStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(setOpdVisitStatusSchema))
    dto: { status: OpdVisitStatus; reason?: string },
  ) {
    return this.opd.setStatus(requireTenant(user), id, dto.status, dto.reason);
  }
}
