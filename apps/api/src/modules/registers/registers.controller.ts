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
  type CreateBirthRecordInput,
  type CreateDeathRecordInput,
  type RecordRegistrationInput,
  type UpdateBirthRecordInput,
  type UpdateDeathRecordInput,
  birthListQuerySchema,
  createBirthRecordSchema,
  createDeathRecordSchema,
  deathListQuerySchema,
  recordRegistrationSchema,
  updateBirthRecordSchema,
  updateDeathRecordSchema,
} from '@hms/shared';
import { Audit } from '../../common/audit/audit.decorator.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { Permissions } from '../../common/auth/permissions.decorator.js';
import { requireTenant } from '../../common/auth/require-tenant.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import {
  type BirthListFilter,
  type DeathListFilter,
  RegistersService,
} from './registers.service.js';

/**
 * Births and deaths are legal source documents naming people who are not always
 * patients here, so every read is audited.
 */
@Controller('registers')
export class RegistersController {
  constructor(private readonly registers: RegistersService) {}

  // --- births -----------------------------------------------------

  @Get('births')
  @Permissions('birth:read')
  @Audit('birth.list')
  listBirths(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(birthListQuerySchema)) query: BirthListFilter,
  ) {
    return this.registers.listBirths(requireTenant(user), query);
  }

  @Post('births')
  @Permissions('birth:manage')
  @Audit('birth.create')
  createBirth(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createBirthRecordSchema))
    dto: CreateBirthRecordInput,
  ) {
    return this.registers.createBirth(requireTenant(user), user.id, dto);
  }

  @Get('births/:id')
  @Permissions('birth:read')
  @Audit('birth.read')
  getBirth(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.registers.getBirth(requireTenant(user), id);
  }

  @Patch('births/:id')
  @Permissions('birth:manage')
  @Audit('birth.update')
  updateBirth(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateBirthRecordSchema))
    dto: UpdateBirthRecordInput,
  ) {
    return this.registers.updateBirth(requireTenant(user), id, dto);
  }

  @Post('births/:id/registration')
  @Permissions('birth:manage')
  @Audit('birth.register')
  registerBirth(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(recordRegistrationSchema))
    dto: RecordRegistrationInput,
  ) {
    return this.registers.registerBirth(requireTenant(user), id, dto);
  }

  // --- deaths -----------------------------------------------------

  @Get('deaths')
  @Permissions('death:read')
  @Audit('death.list')
  listDeaths(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(deathListQuerySchema)) query: DeathListFilter,
  ) {
    return this.registers.listDeaths(requireTenant(user), query);
  }

  @Post('deaths')
  @Permissions('death:manage')
  @Audit('death.create')
  createDeath(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createDeathRecordSchema))
    dto: CreateDeathRecordInput,
  ) {
    return this.registers.createDeath(requireTenant(user), user.id, dto);
  }

  @Get('deaths/:id')
  @Permissions('death:read')
  @Audit('death.read')
  getDeath(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.registers.getDeath(requireTenant(user), id);
  }

  @Patch('deaths/:id')
  @Permissions('death:manage')
  @Audit('death.update')
  updateDeath(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateDeathRecordSchema))
    dto: UpdateDeathRecordInput,
  ) {
    return this.registers.updateDeath(requireTenant(user), id, dto);
  }

  @Post('deaths/:id/registration')
  @Permissions('death:manage')
  @Audit('death.register')
  registerDeath(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(recordRegistrationSchema))
    dto: RecordRegistrationInput,
  ) {
    return this.registers.registerDeath(requireTenant(user), id, dto);
  }
}
