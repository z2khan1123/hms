import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import {
  type AddChargeItemInput,
  addChargeItemSchema,
  type CreatePaymentInput,
  createPaymentSchema,
  reversePaymentSchema,
} from '@hms/shared';
import { Audit } from '../../common/audit/audit.decorator.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { Permissions } from '../../common/auth/permissions.decorator.js';
import { requireTenant } from '../../common/auth/require-tenant.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { BillingService } from './billing.service.js';

@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  // --- charge items --------------------------------------------------------

  @Post('charge-items')
  @Permissions('charge:create')
  addChargeItem(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(addChargeItemSchema)) dto: AddChargeItemInput,
  ) {
    return this.billing.addChargeItem(requireTenant(user), user.id, dto);
  }

  @Get('cases/:caseId/charge-items')
  @Permissions('charge:read')
  @Audit('billing.charge_items.list')
  listChargeItems(
    @CurrentUser() user: AuthUser,
    @Param('caseId', ParseUUIDPipe) caseId: string,
  ) {
    return this.billing.listChargeItems(requireTenant(user), caseId);
  }

  @Delete('charge-items/:id')
  @Permissions('charge:delete')
  @HttpCode(204)
  async removeChargeItem(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.billing.removeChargeItem(requireTenant(user), id);
  }

  // --- payments ------------------------------------------------------------

  @Post('payments')
  @Permissions('payment:create')
  createPayment(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createPaymentSchema)) dto: CreatePaymentInput,
  ) {
    return this.billing.createPayment(requireTenant(user), user.id, dto);
  }

  @Get('cases/:caseId/payments')
  @Permissions('payment:read')
  @Audit('billing.payments.list')
  listPayments(
    @CurrentUser() user: AuthUser,
    @Param('caseId', ParseUUIDPipe) caseId: string,
  ) {
    return this.billing.listPayments(requireTenant(user), caseId);
  }

  @Post('payments/:id/reverse')
  @Permissions('payment:reverse')
  reversePayment(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(reversePaymentSchema)) dto: { reason: string },
  ) {
    return this.billing.reversePayment(requireTenant(user), id, dto.reason);
  }

  // --- the bill ------------------------------------------------------------

  @Get('cases/:caseId/ledger')
  @Permissions('charge:read')
  @Audit('billing.ledger.read')
  ledger(
    @CurrentUser() user: AuthUser,
    @Param('caseId', ParseUUIDPipe) caseId: string,
  ) {
    return this.billing.ledger(requireTenant(user), caseId);
  }
}
