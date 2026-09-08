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
import type { z } from 'zod';
import {
  type CreateDonorInput,
  type IssueBloodInput,
  type RecordDonationInput,
  type UpdateDonorInput,
  bloodIssueListQuerySchema,
  bloodUnitListQuerySchema,
  createDonorSchema,
  discardUnitSchema,
  donorListQuerySchema,
  issueBloodSchema,
  recordDonationSchema,
  updateDonorSchema,
} from '@hms/shared';
import { Audit } from '../../common/audit/audit.decorator.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { Permissions } from '../../common/auth/permissions.decorator.js';
import { requireTenant } from '../../common/auth/require-tenant.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import {
  type DonorListFilter,
  type IssueListFilter,
  type UnitListFilter,
  BloodBankService,
} from './bloodbank.service.js';

type DiscardBody = z.infer<typeof discardUnitSchema>;

/**
 * Literal sub-paths (`donors`, `units`, `stock`, `issues`) come before the
 * `:id` routes nested under them so a param route never swallows a literal.
 *
 * Issuing is audited: who gave which bag to which patient is exactly the
 * question a transfusion investigation starts with.
 */
@Controller('blood')
export class BloodBankController {
  constructor(private readonly blood: BloodBankService) {}

  // --- donors -----------------------------------------------------

  @Get('donors')
  @Permissions('donor:read')
  listDonors(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(donorListQuerySchema)) query: DonorListFilter,
  ) {
    return this.blood.listDonors(requireTenant(user), query);
  }

  @Post('donors')
  @Permissions('donor:manage')
  createDonor(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createDonorSchema)) dto: CreateDonorInput,
  ) {
    return this.blood.createDonor(requireTenant(user), dto);
  }

  @Get('donors/:id')
  @Permissions('donor:read')
  getDonor(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.blood.getDonor(requireTenant(user), id);
  }

  @Patch('donors/:id')
  @Permissions('donor:manage')
  updateDonor(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateDonorSchema)) dto: UpdateDonorInput,
  ) {
    return this.blood.updateDonor(requireTenant(user), id, dto);
  }

  // --- stock and units --------------------------------------------

  @Get('stock')
  @Permissions('blood:read')
  stock(@CurrentUser() user: AuthUser) {
    return this.blood.stock(requireTenant(user));
  }

  @Get('units')
  @Permissions('blood:read')
  listUnits(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(bloodUnitListQuerySchema)) query: UnitListFilter,
  ) {
    return this.blood.listUnits(requireTenant(user), query);
  }

  @Post('units')
  @Permissions('blood:collect')
  @Audit('blood.collect')
  recordDonation(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(recordDonationSchema)) dto: RecordDonationInput,
  ) {
    return this.blood.recordDonation(requireTenant(user), user.id, dto);
  }

  @Get('units/:id')
  @Permissions('blood:read')
  getUnit(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.blood.getUnit(requireTenant(user), id);
  }

  @Post('units/:id/discard')
  @Permissions('blood:discard')
  @Audit('blood.discard')
  discardUnit(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(discardUnitSchema)) dto: DiscardBody,
  ) {
    return this.blood.discardUnit(requireTenant(user), id, dto.reason);
  }

  // --- issuing ----------------------------------------------------

  @Get('issues')
  @Permissions('blood:read')
  @Audit('blood.issue.list')
  listIssues(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(bloodIssueListQuerySchema)) query: IssueListFilter,
  ) {
    return this.blood.listIssues(requireTenant(user), query);
  }

  @Post('issues')
  @Permissions('blood:issue')
  @Audit('blood.issue')
  issue(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(issueBloodSchema)) dto: IssueBloodInput,
  ) {
    return this.blood.issue(requireTenant(user), user.id, dto);
  }
}
