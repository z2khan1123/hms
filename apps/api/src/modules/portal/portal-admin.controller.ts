import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import {
  type InvitePortalAccountInput,
  invitePortalAccountSchema,
} from '@hms/shared';
import { Audit } from '../../common/audit/audit.decorator.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { Permissions } from '../../common/auth/permissions.decorator.js';
import { requireTenant } from '../../common/auth/require-tenant.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { PortalAuthService } from './portal-auth.service.js';
import { PortalService } from './portal.service.js';

const setActiveSchema = z.object({ isActive: z.boolean() });
const declineSchema = z.object({ reason: z.string().trim().min(2).max(300) });
const markBookedSchema = z.object({ appointmentId: z.string().uuid() });
const requestListSchema = z.object({
  status: z.enum(['pending', 'booked', 'declined']).optional(),
});

/**
 * The staff side of the portal: inviting patients and working the appointment
 * request queue. Separate controller from `/portal` on purpose — this one is
 * guarded by the ordinary staff permissions, that one is not.
 */
@Controller('portal-admin')
export class PortalAdminController {
  constructor(
    private readonly auth: PortalAuthService,
    private readonly portal: PortalService,
  ) {}

  @Get('accounts')
  @Permissions('portal:manage')
  @Audit('portal.accounts.list')
  listAccounts(@CurrentUser() user: AuthUser) {
    return this.auth.listAccounts(requireTenant(user));
  }

  @Post('accounts')
  @Permissions('portal:manage')
  @Audit('portal.invite')
  invite(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(invitePortalAccountSchema))
    dto: InvitePortalAccountInput,
  ) {
    return this.auth.invite(requireTenant(user), user.id, dto);
  }

  @Post('accounts/:patientId/active')
  @Permissions('portal:manage')
  @HttpCode(200)
  @Audit('portal.account.setActive')
  setActive(
    @CurrentUser() user: AuthUser,
    @Param('patientId', ParseUUIDPipe) patientId: string,
    @Body(new ZodValidationPipe(setActiveSchema)) dto: { isActive: boolean },
  ) {
    return this.auth.setActive(requireTenant(user), patientId, dto.isActive);
  }

  // --- the request queue ------------------------------------------

  @Get('requests')
  @Permissions('appointment:read')
  listRequests(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(requestListSchema)) query: { status?: string },
  ) {
    return this.portal.listRequests(requireTenant(user), query.status);
  }

  @Post('requests/:id/decline')
  @Permissions('appointment:update')
  @HttpCode(204)
  async decline(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(declineSchema)) dto: { reason: string },
  ) {
    await this.portal.declineRequest(requireTenant(user), user.id, id, dto.reason);
  }

  @Post('requests/:id/booked')
  @Permissions('appointment:create')
  @HttpCode(204)
  async markBooked(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(markBookedSchema)) dto: { appointmentId: string },
  ) {
    await this.portal.markBooked(
      requireTenant(user),
      user.id,
      id,
      dto.appointmentId,
    );
  }
}
