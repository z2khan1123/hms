import { Body, Controller, Get, Param, ParseUUIDPipe, Put } from '@nestjs/common';
import {
  type SetPrescriptionInput,
  setPrescriptionSchema,
} from '@hms/shared';
import { Audit } from '../../common/audit/audit.decorator.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { Permissions } from '../../common/auth/permissions.decorator.js';
import { requireTenant } from '../../common/auth/require-tenant.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { PrescriptionsService } from './prescriptions.service.js';

@Controller('opd')
export class PrescriptionsController {
  constructor(private readonly prescriptions: PrescriptionsService) {}

  @Get(':id/prescription')
  @Permissions('prescription:read')
  @Audit('prescription.read')
  list(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.prescriptions.list(requireTenant(user), id);
  }

  @Put(':id/prescription')
  @Permissions('prescription:write')
  set(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(setPrescriptionSchema)) dto: SetPrescriptionInput,
  ) {
    return this.prescriptions.set(requireTenant(user), user.id, id, dto);
  }
}
