import { Body, Controller, Get, Post } from '@nestjs/common';
import {
  type CreatePractitionerInput,
  createPractitionerSchema,
} from '@hms/shared';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { Permissions } from '../../common/auth/permissions.decorator.js';
import { requireTenant } from '../../common/auth/require-tenant.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { PractitionersService } from './practitioners.service.js';

@Controller('practitioners')
export class PractitionersController {
  constructor(private readonly practitioners: PractitionersService) {}

  @Get()
  @Permissions('practitioner:read')
  list(@CurrentUser() user: AuthUser) {
    return this.practitioners.list(requireTenant(user));
  }

  @Post()
  @Permissions('practitioner:manage')
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createPractitionerSchema))
    dto: CreatePractitionerInput,
  ) {
    return this.practitioners.create(requireTenant(user), dto);
  }
}
