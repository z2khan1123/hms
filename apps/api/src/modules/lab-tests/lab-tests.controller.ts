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
  type CreateLabTestInput,
  createLabTestSchema,
  labTestListQuerySchema,
  type UpdateLabTestInput,
  updateLabTestSchema,
} from '@hms/shared';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { Permissions } from '../../common/auth/permissions.decorator.js';
import { requireTenant } from '../../common/auth/require-tenant.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import {
  type LabTestListFilter,
  LabTestsService,
} from './lab-tests.service.js';

@Controller('lab-tests')
export class LabTestsController {
  constructor(private readonly labTests: LabTestsService) {}

  @Get()
  @Permissions('labtest:read')
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(labTestListQuerySchema))
    query: LabTestListFilter,
  ) {
    return this.labTests.list(requireTenant(user), query);
  }

  @Post()
  @Permissions('labtest:manage')
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createLabTestSchema)) dto: CreateLabTestInput,
  ) {
    return this.labTests.create(requireTenant(user), dto);
  }

  @Get(':id')
  @Permissions('labtest:read')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.labTests.get(requireTenant(user), id);
  }

  @Patch(':id')
  @Permissions('labtest:manage')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateLabTestSchema)) dto: UpdateLabTestInput,
  ) {
    return this.labTests.update(requireTenant(user), id, dto);
  }

  @Delete(':id')
  @Permissions('labtest:manage')
  remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.labTests.remove(requireTenant(user), id);
  }
}
