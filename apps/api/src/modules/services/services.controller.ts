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
  type CreateServiceInput,
  createServiceSchema,
  serviceListQuerySchema,
  type UpdateServiceInput,
  updateServiceSchema,
} from '@hms/shared';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { Permissions } from '../../common/auth/permissions.decorator.js';
import { requireTenant } from '../../common/auth/require-tenant.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { type ServiceListFilter, ServicesService } from './services.service.js';

@Controller('services')
export class ServicesController {
  constructor(private readonly services: ServicesService) {}

  @Get()
  @Permissions('service:read')
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(serviceListQuerySchema))
    query: ServiceListFilter,
  ) {
    return this.services.list(requireTenant(user), query);
  }

  @Post()
  @Permissions('service:manage')
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createServiceSchema)) dto: CreateServiceInput,
  ) {
    return this.services.create(requireTenant(user), dto);
  }

  @Get(':id')
  @Permissions('service:read')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.services.get(requireTenant(user), id);
  }

  @Patch(':id')
  @Permissions('service:manage')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateServiceSchema)) dto: UpdateServiceInput,
  ) {
    return this.services.update(requireTenant(user), id, dto);
  }

  @Delete(':id')
  @Permissions('service:manage')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.services.remove(requireTenant(user), id);
  }
}
