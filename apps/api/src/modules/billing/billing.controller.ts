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
} from '@nestjs/common';
import {
  type AddBillItemInput,
  addBillItemSchema,
  type AdjustBillItemInput,
  adjustBillItemSchema,
  approveBillItemSchema,
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

  // --- bill items --------------------------------------------------------

  @Get('pending')
  @Permissions('bill:read')
  @Audit('bill.pending')
  pending(@CurrentUser() user: AuthUser) {
    return this.billing.pending(requireTenant(user));
  }

  @Post('bill-items/:id/approve')
  @Permissions('bill:approve')
  approveBillItem(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(approveBillItemSchema)) dto: { reason: string },
  ) {
    return this.billing.approveBillItem(
      requireTenant(user),
      user.id,
      id,
      dto.reason,
    );
  }

  /**
   * Reduce a charge that has not been paid yet — in practice a doctor obliging a
   * patient on his own consultation fee, from his own view rather than sending
   * the patient back to the front desk. Only a `pending` line may be adjusted.
   */
  @Patch('bill-items/:id')
  @Permissions('bill:discount')
  adjustBillItem(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(adjustBillItemSchema)) dto: AdjustBillItemInput,
  ) {
    return this.billing.adjustBillItem(requireTenant(user), user.id, id, dto);
  }

  @Post('bill-items')
  @Permissions('bill:create')
  addBillItem(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(addBillItemSchema)) dto: AddBillItemInput,
  ) {
    return this.billing.addBillItem(requireTenant(user), user.id, dto);
  }

  @Get('cases/:caseId/bill-items')
  @Permissions('bill:read')
  @Audit('bill.list')
  listBillItems(
    @CurrentUser() user: AuthUser,
    @Param('caseId', ParseUUIDPipe) caseId: string,
  ) {
    return this.billing.listBillItems(requireTenant(user), caseId);
  }

  @Delete('bill-items/:id')
  @Permissions('bill:delete')
  @HttpCode(204)
  async removeBillItem(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    await this.billing.removeBillItem(requireTenant(user), id);
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
  @Audit('payment.list')
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
  @Permissions('bill:read')
  @Audit('bill.read')
  ledger(
    @CurrentUser() user: AuthUser,
    @Param('caseId', ParseUUIDPipe) caseId: string,
  ) {
    return this.billing.ledger(requireTenant(user), caseId);
  }
}
