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
import { z } from 'zod';
import {
  type CompleteCallInput,
  type CreateCallInput,
  type CreateVehicleInput,
  type UpdateVehicleInput,
  callListQuerySchema,
  cancelCallSchema,
  completeCallSchema,
  createCallSchema,
  createVehicleSchema,
  isoDateSchema,
  updateVehicleSchema,
  vehicleListQuerySchema,
} from '@hms/shared';
import { Audit } from '../../common/audit/audit.decorator.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { Permissions } from '../../common/auth/permissions.decorator.js';
import { requireTenant } from '../../common/auth/require-tenant.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import {
  type CallListFilter,
  type VehicleListFilter,
  AmbulanceService,
} from './ambulance.service.js';

const arriveSchema = z.object({ arrivedAt: z.string().datetime().optional() });
type ArriveBody = z.infer<typeof arriveSchema>;
type CancelBody = z.infer<typeof cancelCallSchema>;

const statsQuerySchema = z.object({
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});
type StatsQuery = z.infer<typeof statsQuerySchema>;

/**
 * Literal sub-paths (`vehicles`, `calls`, `stats`) come before the `:id` routes
 * nested under them so a param route never swallows a literal.
 */
@Controller('ambulance')
export class AmbulanceController {
  constructor(private readonly ambulance: AmbulanceService) {}

  // --- vehicles ---------------------------------------------------

  @Get('vehicles')
  @Permissions('vehicle:read')
  listVehicles(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(vehicleListQuerySchema)) query: VehicleListFilter,
  ) {
    return this.ambulance.listVehicles(requireTenant(user), query);
  }

  @Post('vehicles')
  @Permissions('vehicle:manage')
  createVehicle(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createVehicleSchema)) dto: CreateVehicleInput,
  ) {
    return this.ambulance.createVehicle(requireTenant(user), dto);
  }

  @Patch('vehicles/:id')
  @Permissions('vehicle:manage')
  updateVehicle(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateVehicleSchema)) dto: UpdateVehicleInput,
  ) {
    return this.ambulance.updateVehicle(requireTenant(user), id, dto);
  }

  // --- calls ------------------------------------------------------

  @Get('calls/stats')
  @Permissions('call:read')
  stats(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(statsQuerySchema)) query: StatsQuery,
  ) {
    return this.ambulance.responseStats(requireTenant(user), query.from, query.to);
  }

  @Get('calls')
  @Permissions('call:read')
  listCalls(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(callListQuerySchema)) query: CallListFilter,
  ) {
    return this.ambulance.listCalls(requireTenant(user), query);
  }

  @Post('calls')
  @Permissions('call:dispatch')
  @Audit('ambulance.dispatch')
  dispatch(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createCallSchema)) dto: CreateCallInput,
  ) {
    return this.ambulance.dispatch(requireTenant(user), user.id, dto);
  }

  @Get('calls/:id')
  @Permissions('call:read')
  getCall(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.ambulance.getCall(requireTenant(user), id);
  }

  @Post('calls/:id/arrive')
  @Permissions('call:dispatch')
  arrive(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(arriveSchema)) dto: ArriveBody,
  ) {
    return this.ambulance.markArrived(requireTenant(user), id, dto.arrivedAt);
  }

  @Post('calls/:id/complete')
  @Permissions('call:dispatch')
  @Audit('ambulance.complete')
  complete(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(completeCallSchema)) dto: CompleteCallInput,
  ) {
    return this.ambulance.complete(requireTenant(user), user.id, id, dto);
  }

  @Post('calls/:id/cancel')
  @Permissions('call:dispatch')
  cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(cancelCallSchema)) dto: CancelBody,
  ) {
    return this.ambulance.cancel(requireTenant(user), id, dto.reason);
  }
}
