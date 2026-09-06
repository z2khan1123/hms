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
import {
  chargeListQuerySchema,
  chargeTypeKindSchema,
  type CreateChargeCategoryInput,
  type CreateChargeInput,
  createChargeCategorySchema,
  createChargeSchema,
  createTaxCategorySchema,
  createUnitTypeSchema,
  type UpdateChargeInput,
  updateChargeSchema,
} from '@hms/shared';
import { z } from 'zod';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { Permissions } from '../../common/auth/permissions.decorator.js';
import { requireTenant } from '../../common/auth/require-tenant.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import {
  type CategoryListFilter,
  ChargeMasterService,
  type ChargeListFilter,
  type CreateTaxCategoryInput,
  type CreateUnitTypeInput,
  type UpdateChargeCategoryInput,
  type UpdateTaxCategoryInput,
  type UpdateUnitTypeInput,
} from './charge-master.service.js';

// The frozen contract ships create-shapes only; the partials for PATCH are
// derived here rather than added to @hms/shared.
const updateChargeCategorySchema = createChargeCategorySchema
  .partial()
  .extend({ isActive: z.boolean().optional() });
const updateUnitTypeSchema = createUnitTypeSchema
  .partial()
  .extend({ isActive: z.boolean().optional() });
const updateTaxCategorySchema = createTaxCategorySchema
  .partial()
  .extend({ isActive: z.boolean().optional() });

const includeInactiveSchema = z.object({
  includeInactive: z.coerce.boolean().optional(),
});
const categoryListQuerySchema = includeInactiveSchema.extend({
  chargeType: chargeTypeKindSchema.optional(),
});

@Controller('charge-master')
export class ChargeMasterController {
  constructor(private readonly chargeMaster: ChargeMasterService) {}

  // --- categories ----------------------------------------------------------

  @Get('categories')
  @Permissions('charge_master:read')
  listCategories(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(categoryListQuerySchema))
    query: CategoryListFilter,
  ) {
    return this.chargeMaster.listCategories(requireTenant(user), query);
  }

  @Post('categories')
  @Permissions('charge_master:manage')
  createCategory(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createChargeCategorySchema))
    dto: CreateChargeCategoryInput,
  ) {
    return this.chargeMaster.createCategory(requireTenant(user), dto);
  }

  @Patch('categories/:id')
  @Permissions('charge_master:manage')
  updateCategory(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateChargeCategorySchema))
    dto: UpdateChargeCategoryInput,
  ) {
    return this.chargeMaster.updateCategory(requireTenant(user), id, dto);
  }

  @Delete('categories/:id')
  @Permissions('charge_master:manage')
  deactivateCategory(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.chargeMaster.deactivateCategory(requireTenant(user), id);
  }

  // --- unit types ----------------------------------------------------------

  @Get('unit-types')
  @Permissions('charge_master:read')
  listUnitTypes(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(includeInactiveSchema))
    query: { includeInactive?: boolean },
  ) {
    return this.chargeMaster.listUnitTypes(
      requireTenant(user),
      query.includeInactive,
    );
  }

  @Post('unit-types')
  @Permissions('charge_master:manage')
  createUnitType(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createUnitTypeSchema)) dto: CreateUnitTypeInput,
  ) {
    return this.chargeMaster.createUnitType(requireTenant(user), dto);
  }

  @Patch('unit-types/:id')
  @Permissions('charge_master:manage')
  updateUnitType(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateUnitTypeSchema)) dto: UpdateUnitTypeInput,
  ) {
    return this.chargeMaster.updateUnitType(requireTenant(user), id, dto);
  }

  @Delete('unit-types/:id')
  @Permissions('charge_master:manage')
  deactivateUnitType(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.chargeMaster.deactivateUnitType(requireTenant(user), id);
  }

  // --- tax categories ------------------------------------------------------

  @Get('tax-categories')
  @Permissions('charge_master:read')
  listTaxCategories(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(includeInactiveSchema))
    query: { includeInactive?: boolean },
  ) {
    return this.chargeMaster.listTaxCategories(
      requireTenant(user),
      query.includeInactive,
    );
  }

  @Post('tax-categories')
  @Permissions('charge_master:manage')
  createTaxCategory(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createTaxCategorySchema))
    dto: CreateTaxCategoryInput,
  ) {
    return this.chargeMaster.createTaxCategory(requireTenant(user), dto);
  }

  @Patch('tax-categories/:id')
  @Permissions('charge_master:manage')
  updateTaxCategory(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateTaxCategorySchema))
    dto: UpdateTaxCategoryInput,
  ) {
    return this.chargeMaster.updateTaxCategory(requireTenant(user), id, dto);
  }

  @Delete('tax-categories/:id')
  @Permissions('charge_master:manage')
  deactivateTaxCategory(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.chargeMaster.deactivateTaxCategory(requireTenant(user), id);
  }

  // --- charges -------------------------------------------------------------

  @Get('charges')
  @Permissions('charge_master:read')
  listCharges(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(chargeListQuerySchema))
    query: ChargeListFilter,
  ) {
    return this.chargeMaster.listCharges(requireTenant(user), query);
  }

  @Get('charges/:id')
  @Permissions('charge_master:read')
  getCharge(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.chargeMaster.getCharge(requireTenant(user), id);
  }

  @Post('charges')
  @Permissions('charge_master:manage')
  createCharge(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createChargeSchema)) dto: CreateChargeInput,
  ) {
    return this.chargeMaster.createCharge(requireTenant(user), dto);
  }

  @Patch('charges/:id')
  @Permissions('charge_master:manage')
  updateCharge(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateChargeSchema)) dto: UpdateChargeInput,
  ) {
    return this.chargeMaster.updateCharge(requireTenant(user), id, dto);
  }

  @Delete('charges/:id')
  @Permissions('charge_master:manage')
  deactivateCharge(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.chargeMaster.deactivateCharge(requireTenant(user), id);
  }
}
