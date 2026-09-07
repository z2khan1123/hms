import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  type CreatePatientInput,
  createPatientSchema,
  paginationQuerySchema,
  patientSearchQuerySchema,
  type UpdatePatientInput,
  updatePatientSchema,
} from '@hms/shared';
import { Audit } from '../../common/audit/audit.decorator.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { Permissions } from '../../common/auth/permissions.decorator.js';
import { requireTenant } from '../../common/auth/require-tenant.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { PatientsService } from './patients.service.js';

const listQuerySchema = paginationQuerySchema.merge(patientSearchQuerySchema);

@Controller('patients')
export class PatientsController {
  constructor(private readonly patients: PatientsService) {}

  @Post()
  @Permissions('patient:create')
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createPatientSchema)) dto: CreatePatientInput,
  ) {
    return this.patients.create(requireTenant(user), dto);
  }

  @Get()
  @Permissions('patient:read')
  @Audit('patient.list')
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(listQuerySchema))
    query: { page: number; pageSize: number; q?: string },
  ) {
    return this.patients.list(requireTenant(user), query);
  }

  @Get(':id')
  @Permissions('patient:read')
  @Audit('patient.read')
  get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.patients.get(requireTenant(user), id);
  }

  @Get(':id/history-alert')
  @Permissions('patient:read')
  @Audit('patient.history')
  historyAlert(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.patients.historyAlert(requireTenant(user), id);
  }

  @Patch(':id')
  @Permissions('patient:update')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updatePatientSchema)) dto: UpdatePatientInput,
  ) {
    return this.patients.update(requireTenant(user), id, dto);
  }

  @Delete(':id')
  @Permissions('patient:delete')
  @HttpCode(204)
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.patients.remove(requireTenant(user), id);
  }
}
