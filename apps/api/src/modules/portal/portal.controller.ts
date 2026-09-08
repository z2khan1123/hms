import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  type ChangePortalPasswordInput,
  type PortalLoginInput,
  type RequestAppointmentInput,
  type SetPortalPasswordInput,
  changePortalPasswordSchema,
  portalLoginSchema,
  requestAppointmentSchema,
  setPortalPasswordSchema,
} from '@hms/shared';
import { Audit } from '../../common/audit/audit.decorator.js';
import { Public } from '../../common/auth/public.decorator.js';
import { PortalPublic } from './portal-public.decorator.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { CurrentPortalUser } from './portal-caller.decorator.js';
import { PortalAuthService } from './portal-auth.service.js';
import { type PortalCaller, PortalGuard } from './portal.guard.js';
import { PortalService } from './portal.service.js';

/**
 * The patient's own view of their record.
 *
 * Guarded by `PortalGuard`, never by the staff guards. Note that no route here
 * takes a patient id: the id comes from the token every time. An endpoint that
 * accepted one is an endpoint somebody would eventually call with somebody
 * else's.
 */
@Controller('portal')
// `@Public()` stands the STAFF guards down for this whole controller — a
// patient has no role and would fail them. `PortalGuard` then does the real
// work, and reads its own flag rather than this one.
@Public()
@UseGuards(PortalGuard)
export class PortalController {
  constructor(
    private readonly auth: PortalAuthService,
    private readonly portal: PortalService,
  ) {}

  // --- open routes -------------------------------------------------

  @Post('login')
  @PortalPublic()
  @HttpCode(200)
  @Audit('portal.login')
  login(@Body(new ZodValidationPipe(portalLoginSchema)) dto: PortalLoginInput) {
    return this.auth.login(dto);
  }

  /** Redeeming an invitation. Public because they have no session yet. */
  @Post('set-password')
  @PortalPublic()
  @HttpCode(204)
  async setPassword(
    @Body(new ZodValidationPipe(setPortalPasswordSchema))
    dto: SetPortalPasswordInput,
  ) {
    await this.auth.setPassword(dto);
  }

  // --- signed in ---------------------------------------------------

  @Post('change-password')
  @HttpCode(204)
  async changePassword(
    @CurrentPortalUser() me: PortalCaller,
    @Body(new ZodValidationPipe(changePortalPasswordSchema))
    dto: ChangePortalPasswordInput,
  ) {
    await this.auth.changePassword(me.accountId, dto);
  }

  @Get('me')
  @Audit('portal.summary')
  summary(@CurrentPortalUser() me: PortalCaller) {
    return this.portal.summary(me.tenantId, me.patientId);
  }

  @Get('visits')
  @Audit('portal.visits')
  visits(@CurrentPortalUser() me: PortalCaller) {
    return this.portal.visits(me.tenantId, me.patientId);
  }

  @Get('prescriptions')
  @Audit('portal.prescriptions')
  prescriptions(@CurrentPortalUser() me: PortalCaller) {
    return this.portal.prescriptions(me.tenantId, me.patientId);
  }

  @Get('reports')
  @Audit('portal.reports')
  reports(@CurrentPortalUser() me: PortalCaller) {
    return this.portal.reports(me.tenantId, me.patientId);
  }

  @Get('bills')
  @Audit('portal.bills')
  bills(@CurrentPortalUser() me: PortalCaller) {
    return this.portal.bills(me.tenantId, me.patientId);
  }

  @Get('appointments')
  appointments(@CurrentPortalUser() me: PortalCaller) {
    return this.portal.appointments(me.tenantId, me.patientId);
  }

  @Get('appointment-requests')
  myRequests(@CurrentPortalUser() me: PortalCaller) {
    return this.portal.myRequests(me.tenantId, me.patientId);
  }

  @Post('appointment-requests')
  requestAppointment(
    @CurrentPortalUser() me: PortalCaller,
    @Body(new ZodValidationPipe(requestAppointmentSchema))
    dto: RequestAppointmentInput,
  ) {
    return this.portal.requestAppointment(me.tenantId, me.patientId, dto);
  }
}
