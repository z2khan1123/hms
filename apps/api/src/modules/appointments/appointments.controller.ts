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
  appointmentListQuerySchema,
  type AppointmentStatus,
  type CreateAppointmentInput,
  createAppointmentSchema,
  rescheduleAppointmentSchema,
  updateAppointmentStatusSchema,
} from '@hms/shared';
import { Audit } from '../../common/audit/audit.decorator.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { Permissions } from '../../common/auth/permissions.decorator.js';
import { requireTenant } from '../../common/auth/require-tenant.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import {
  type AppointmentListFilter,
  AppointmentsService,
} from './appointments.service.js';

@Controller('appointments')
export class AppointmentsController {
  constructor(private readonly appointments: AppointmentsService) {}

  @Get()
  @Permissions('appointment:read')
  @Audit('appointment.list')
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(appointmentListQuerySchema))
    query: AppointmentListFilter,
  ) {
    return this.appointments.list(requireTenant(user), query);
  }

  @Get(':id')
  @Permissions('appointment:read')
  @Audit('appointment.read')
  get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.appointments.get(requireTenant(user), id);
  }

  @Post()
  @Permissions('appointment:create')
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createAppointmentSchema))
    dto: CreateAppointmentInput,
  ) {
    return this.appointments.create(requireTenant(user), user.id, dto);
  }

  @Patch(':id/schedule')
  @Permissions('appointment:update')
  reschedule(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(rescheduleAppointmentSchema))
    dto: { startsAt: string; endsAt: string },
  ) {
    return this.appointments.reschedule(
      requireTenant(user),
      id,
      dto.startsAt,
      dto.endsAt,
    );
  }

  @Patch(':id/status')
  @Permissions('appointment:update')
  setStatus(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateAppointmentStatusSchema))
    dto: { status: AppointmentStatus },
  ) {
    return this.appointments.setStatus(requireTenant(user), id, dto.status);
  }
}
