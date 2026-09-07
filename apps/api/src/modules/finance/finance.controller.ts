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
  type CreateExpenseInput,
  type CreateIncomeInput,
  type CreateLedgerHeadInput,
  createExpenseSchema,
  createIncomeSchema,
  createLedgerHeadSchema,
  ledgerListQuerySchema,
  type UpdateLedgerHeadInput,
  updateLedgerHeadSchema,
} from '@hms/shared';
import { Audit } from '../../common/audit/audit.decorator.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { Permissions } from '../../common/auth/permissions.decorator.js';
import { requireTenant } from '../../common/auth/require-tenant.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { FinanceService } from './finance.service.js';
import {
  financeSummaryQuerySchema,
  type FinanceSummaryQuery,
} from './finance.query.js';

type LedgerListQuery = z.infer<typeof ledgerListQuerySchema>;

/**
 * Literal sub-paths (`income-heads`, `expense-heads`, `income`, `expenses`,
 * `summary`) are declared before the `:id` routes nested under them so a param
 * route never swallows a literal.
 */
@Controller('finance')
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  // --- income heads ----------------------------------------------------

  @Get('income-heads')
  @Permissions('finance:read')
  listIncomeHeads(@CurrentUser() user: AuthUser) {
    return this.finance.listIncomeHeads(requireTenant(user));
  }

  @Post('income-heads')
  @Permissions('finance:manage')
  createIncomeHead(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createLedgerHeadSchema))
    dto: CreateLedgerHeadInput,
  ) {
    return this.finance.createIncomeHead(requireTenant(user), dto);
  }

  @Patch('income-heads/:id')
  @Permissions('finance:manage')
  updateIncomeHead(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateLedgerHeadSchema))
    dto: UpdateLedgerHeadInput,
  ) {
    return this.finance.updateIncomeHead(requireTenant(user), id, dto);
  }

  @Delete('income-heads/:id')
  @Permissions('finance:manage')
  removeIncomeHead(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.finance.removeIncomeHead(requireTenant(user), id);
  }

  // --- expense heads -------------------------------------------------

  @Get('expense-heads')
  @Permissions('finance:read')
  listExpenseHeads(@CurrentUser() user: AuthUser) {
    return this.finance.listExpenseHeads(requireTenant(user));
  }

  @Post('expense-heads')
  @Permissions('finance:manage')
  createExpenseHead(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createLedgerHeadSchema))
    dto: CreateLedgerHeadInput,
  ) {
    return this.finance.createExpenseHead(requireTenant(user), dto);
  }

  @Patch('expense-heads/:id')
  @Permissions('finance:manage')
  updateExpenseHead(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateLedgerHeadSchema))
    dto: UpdateLedgerHeadInput,
  ) {
    return this.finance.updateExpenseHead(requireTenant(user), id, dto);
  }

  @Delete('expense-heads/:id')
  @Permissions('finance:manage')
  removeExpenseHead(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.finance.removeExpenseHead(requireTenant(user), id);
  }

  // --- income entries ---------------------------------------------

  @Get('income')
  @Permissions('finance:read')
  @Audit('income.list')
  listIncome(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(ledgerListQuerySchema))
    query: LedgerListQuery,
  ) {
    return this.finance.listIncome(requireTenant(user), query);
  }

  @Post('income')
  @Permissions('finance:manage')
  createIncome(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createIncomeSchema)) dto: CreateIncomeInput,
  ) {
    return this.finance.createIncome(requireTenant(user), user.id, dto);
  }

  @Delete('income/:id')
  @Permissions('finance:manage')
  removeIncome(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.finance.removeIncome(requireTenant(user), id);
  }

  // --- expense entries ------------------------------------------

  @Get('expenses')
  @Permissions('finance:read')
  @Audit('expense.list')
  listExpenses(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(ledgerListQuerySchema))
    query: LedgerListQuery,
  ) {
    return this.finance.listExpenses(requireTenant(user), query);
  }

  @Post('expenses')
  @Permissions('finance:manage')
  createExpense(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createExpenseSchema)) dto: CreateExpenseInput,
  ) {
    return this.finance.createExpense(requireTenant(user), user.id, dto);
  }

  @Delete('expenses/:id')
  @Permissions('finance:manage')
  removeExpense(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.finance.removeExpense(requireTenant(user), id);
  }

  // --- summary ------------------------------------------------

  @Get('summary')
  @Permissions('finance:read')
  @Audit('finance.summary')
  summary(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(financeSummaryQuerySchema))
    query: FinanceSummaryQuery,
  ) {
    return this.finance.summary(requireTenant(user), query);
  }
}
