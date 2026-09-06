import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import {
  createVitalTypeSchema,
  type RecordVitalsInput,
  recordVitalsSchema,
} from '@hms/shared';
import { z } from 'zod';
import { Audit } from '../../common/audit/audit.decorator.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { Permissions } from '../../common/auth/permissions.decorator.js';
import { requireTenant } from '../../common/auth/require-tenant.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import {
  type CreateVitalTypeInput,
  type VitalListFilter,
  VitalsService,
} from './vitals.service.js';

// A reading query must be anchored to a patient or a visit — the endpoint never
// returns the tenant's entire vitals history.
const vitalListQuerySchema = z
  .object({
    patientId: z.string().uuid().optional(),
    opdVisitId: z.string().uuid().optional(),
  })
  .refine((q) => q.patientId != null || q.opdVisitId != null, {
    message: 'patientId or opdVisitId is required',
  });

@Controller('vitals')
export class VitalsController {
  constructor(private readonly vitals: VitalsService) {}

  // --- vital types -------------------------------------------------------

  @Get('types')
  @Permissions('vital:read')
  listTypes(@CurrentUser() user: AuthUser) {
    return this.vitals.listTypes(requireTenant(user));
  }

  @Post('types')
  @Permissions('vocabulary:manage')
  createType(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createVitalTypeSchema))
    dto: CreateVitalTypeInput,
  ) {
    return this.vitals.createType(requireTenant(user), dto);
  }

  // --- readings --------------------------------------------------------

  @Get()
  @Permissions('vital:read')
  @Audit('vital.read')
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(vitalListQuerySchema)) query: VitalListFilter,
  ) {
    return this.vitals.list(requireTenant(user), query);
  }

  @Post()
  @Permissions('vital:create')
  record(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(recordVitalsSchema)) dto: RecordVitalsInput,
  ) {
    return this.vitals.record(requireTenant(user), user.id, dto);
  }
}
