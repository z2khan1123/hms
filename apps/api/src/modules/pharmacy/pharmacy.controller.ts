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
  Query,
} from '@nestjs/common';
import {
  type CreateDispenseInput,
  createDispenseSchema,
  type CreateMedicineInput,
  createMedicineCategorySchema,
  createMedicineSchema,
  type CreatePurchaseInput,
  createPurchaseSchema,
  medicineListQuerySchema,
  updateMedicineSchema,
} from '@hms/shared';
import { Audit } from '../../common/audit/audit.decorator.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { Permissions } from '../../common/auth/permissions.decorator.js';
import { requireTenant } from '../../common/auth/require-tenant.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import {
  type AllergyCheckInput,
  allergyCheckSchema,
  type BatchListQuery,
  batchListQuerySchema,
  type DispenseListQuery,
  dispenseListQuerySchema,
} from './pharmacy.query.js';
import {
  type MedicineListFilter,
  PharmacyService,
} from './pharmacy.service.js';

type CreateCategoryBody = { name: string };
type UpdateMedicineBody = Parameters<
  PharmacyService['updateMedicine']
>[2];

/**
 * Literal paths are declared before the `:id` param routes so the param route
 * never swallows them.
 */
@Controller('pharmacy')
export class PharmacyController {
  constructor(private readonly pharmacy: PharmacyService) {}

  // --- categories --------------------------------------------------------

  @Get('categories')
  @Permissions('medicine:read')
  listCategories(@CurrentUser() user: AuthUser) {
    return this.pharmacy.listCategories(requireTenant(user));
  }

  @Post('categories')
  @Permissions('medicine:manage')
  createCategory(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createMedicineCategorySchema))
    dto: CreateCategoryBody,
  ) {
    return this.pharmacy.createCategory(requireTenant(user), dto);
  }

  // --- medicines -----------------------------------------------------

  @Get('medicines')
  @Permissions('medicine:read')
  listMedicines(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(medicineListQuerySchema))
    query: MedicineListFilter,
  ) {
    return this.pharmacy.listMedicines(requireTenant(user), query);
  }

  @Post('medicines')
  @Permissions('medicine:manage')
  createMedicine(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createMedicineSchema)) dto: CreateMedicineInput,
  ) {
    return this.pharmacy.createMedicine(requireTenant(user), dto);
  }

  @Get('medicines/:id')
  @Permissions('medicine:read')
  getMedicine(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.pharmacy.getMedicine(requireTenant(user), id);
  }

  @Patch('medicines/:id')
  @Permissions('medicine:manage')
  updateMedicine(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateMedicineSchema)) dto: UpdateMedicineBody,
  ) {
    return this.pharmacy.updateMedicine(requireTenant(user), id, dto);
  }

  @Delete('medicines/:id')
  @Permissions('medicine:manage')
  removeMedicine(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.pharmacy.removeMedicine(requireTenant(user), id);
  }

  // --- stock -------------------------------------------------------

  @Get('batches')
  @Permissions('stock:read')
  listBatches(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(batchListQuerySchema)) query: BatchListQuery,
  ) {
    return this.pharmacy.listBatches(requireTenant(user), query);
  }

  // --- purchases -------------------------------------------------

  @Get('purchases')
  @Permissions('stock:read')
  @Audit('purchase.list')
  listPurchases(@CurrentUser() user: AuthUser) {
    return this.pharmacy.listPurchases(requireTenant(user));
  }

  @Post('purchases')
  @Permissions('stock:manage')
  createPurchase(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createPurchaseSchema)) dto: CreatePurchaseInput,
  ) {
    return this.pharmacy.createPurchase(requireTenant(user), user.id, dto);
  }

  @Get('purchases/:id')
  @Permissions('stock:read')
  getPurchase(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.pharmacy.getPurchase(requireTenant(user), id);
  }

  // --- dispensing ---------------------------------------------

  @Get('dispenses')
  @Permissions('dispense:read')
  @Audit('dispense.list')
  listDispenses(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(dispenseListQuerySchema))
    query: DispenseListQuery,
  ) {
    return this.pharmacy.listDispenses(requireTenant(user), query);
  }

  @Post('dispenses')
  @Permissions('dispense:create')
  createDispense(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createDispenseSchema)) dto: CreateDispenseInput,
  ) {
    return this.pharmacy.createDispense(requireTenant(user), user.id, dto);
  }

  @Get('dispenses/:id')
  @Permissions('dispense:read')
  @Audit('dispense.read')
  getDispense(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.pharmacy.getDispense(requireTenant(user), id);
  }

  // --- the safety check -------------------------------------

  @Post('allergy-check')
  @Permissions('allergy:read')
  @HttpCode(200)
  allergyCheck(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(allergyCheckSchema)) dto: AllergyCheckInput,
  ) {
    return this.pharmacy.allergyCheck(requireTenant(user), dto);
  }
}
