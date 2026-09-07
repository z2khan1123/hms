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
import type { z } from 'zod';
import {
  type CreateReferralPaymentInput,
  type CreateReferrerInput,
  createReferralPaymentSchema,
  createReferrerSchema,
  updateReferrerSchema,
} from '@hms/shared';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { Permissions } from '../../common/auth/permissions.decorator.js';
import { requireTenant } from '../../common/auth/require-tenant.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import {
  referralPaymentListQuerySchema,
  type ReferralPaymentListQuery,
} from './finance.query.js';
import { ReferralsService } from './referrals.service.js';

type UpdateReferrerBody = z.infer<typeof updateReferrerSchema>;

/**
 * Literal sub-paths (`referrers`, `payments`) are declared before the `:id`
 * routes nested under them.
 */
@Controller('referrals')
export class ReferralsController {
  constructor(private readonly referrals: ReferralsService) {}

  // --- referrers -----------------------------------------------------

  @Get('referrers')
  @Permissions('referral:read')
  listReferrers(@CurrentUser() user: AuthUser) {
    return this.referrals.listReferrers(requireTenant(user));
  }

  @Post('referrers')
  @Permissions('referral:manage')
  createReferrer(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createReferrerSchema))
    dto: CreateReferrerInput,
  ) {
    return this.referrals.createReferrer(requireTenant(user), dto);
  }

  @Patch('referrers/:id')
  @Permissions('referral:manage')
  updateReferrer(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateReferrerSchema))
    dto: UpdateReferrerBody,
  ) {
    return this.referrals.updateReferrer(requireTenant(user), id, dto);
  }

  @Delete('referrers/:id')
  @Permissions('referral:manage')
  removeReferrer(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.referrals.removeReferrer(requireTenant(user), id);
  }

  // --- referral payments ------------------------------------------

  @Get('payments')
  @Permissions('referral:read')
  listPayments(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(referralPaymentListQuerySchema))
    query: ReferralPaymentListQuery,
  ) {
    return this.referrals.listPayments(requireTenant(user), query);
  }

  @Post('payments')
  @Permissions('referral:manage')
  createPayment(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createReferralPaymentSchema))
    dto: CreateReferralPaymentInput,
  ) {
    return this.referrals.createPayment(requireTenant(user), user.id, dto);
  }
}
