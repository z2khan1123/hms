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
  bedListQuerySchema,
  blockBedSchema,
  createBedRangeSchema,
  createBedSchema,
  createBedTypeSchema,
  createFloorSchema,
  createWardSchema,
  updateBedSchema,
  updateBedTypeSchema,
  updateFloorSchema,
  updateWardSchema,
} from '@hms/shared';
import { Audit } from '../../common/audit/audit.decorator.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { Permissions } from '../../common/auth/permissions.decorator.js';
import { requireTenant } from '../../common/auth/require-tenant.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { type BedListFilter, WardsService } from './wards.service.js';

type CreateFloorBody = z.infer<typeof createFloorSchema>;
type UpdateFloorBody = z.infer<typeof updateFloorSchema>;
type CreateBedTypeBody = z.infer<typeof createBedTypeSchema>;
type UpdateBedTypeBody = z.infer<typeof updateBedTypeSchema>;
type CreateWardBody = z.infer<typeof createWardSchema>;
type UpdateWardBody = z.infer<typeof updateWardSchema>;
type CreateBedBody = z.infer<typeof createBedSchema>;
type UpdateBedBody = z.infer<typeof updateBedSchema>;
type CreateBedRangeBody = z.infer<typeof createBedRangeSchema>;
type BlockBedBody = z.infer<typeof blockBedSchema>;

/**
 * Literal paths (`/wards/floors`, `/wards/bed-types`, `/wards/beds`,
 * `/wards/board`) are declared before `/wards/:id` so the param route never
 * swallows them.
 */
@Controller('wards')
export class WardsController {
  constructor(private readonly wards: WardsService) {}

  // --- floors ------------------------------------------------------

  @Get('floors')
  @Permissions('ward:read')
  listFloors(@CurrentUser() user: AuthUser) {
    return this.wards.listFloors(requireTenant(user));
  }

  @Post('floors')
  @Permissions('ward:manage')
  createFloor(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createFloorSchema)) dto: CreateFloorBody,
  ) {
    return this.wards.createFloor(requireTenant(user), dto);
  }

  @Patch('floors/:id')
  @Permissions('ward:manage')
  updateFloor(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateFloorSchema)) dto: UpdateFloorBody,
  ) {
    return this.wards.updateFloor(requireTenant(user), id, dto);
  }

  @Delete('floors/:id')
  @Permissions('ward:manage')
  removeFloor(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.wards.removeFloor(requireTenant(user), id);
  }

  // --- bed types -------------------------------------------------

  @Get('bed-types')
  @Permissions('ward:read')
  listBedTypes(@CurrentUser() user: AuthUser) {
    return this.wards.listBedTypes(requireTenant(user));
  }

  @Post('bed-types')
  @Permissions('ward:manage')
  createBedType(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createBedTypeSchema)) dto: CreateBedTypeBody,
  ) {
    return this.wards.createBedType(requireTenant(user), dto);
  }

  @Patch('bed-types/:id')
  @Permissions('ward:manage')
  updateBedType(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateBedTypeSchema)) dto: UpdateBedTypeBody,
  ) {
    return this.wards.updateBedType(requireTenant(user), id, dto);
  }

  @Delete('bed-types/:id')
  @Permissions('ward:manage')
  removeBedType(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.wards.removeBedType(requireTenant(user), id);
  }

  // --- beds ----------------------------------------------------

  @Get('beds')
  @Permissions('ward:read')
  listBeds(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(bedListQuerySchema)) query: BedListFilter,
  ) {
    return this.wards.listBeds(requireTenant(user), query);
  }

  @Post('beds/range')
  @Permissions('ward:manage')
  createBedRange(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createBedRangeSchema)) dto: CreateBedRangeBody,
  ) {
    return this.wards.createBedRange(requireTenant(user), dto);
  }

  @Post('beds')
  @Permissions('ward:manage')
  createBed(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createBedSchema)) dto: CreateBedBody,
  ) {
    return this.wards.createBed(requireTenant(user), dto);
  }

  @Patch('beds/:id')
  @Permissions('ward:manage')
  updateBed(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateBedSchema)) dto: UpdateBedBody,
  ) {
    return this.wards.updateBed(requireTenant(user), id, dto);
  }

  @Delete('beds/:id')
  @Permissions('ward:manage')
  removeBed(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.wards.removeBed(requireTenant(user), id);
  }

  @Post('beds/:id/block')
  @Permissions('ward:manage')
  blockBed(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(blockBedSchema)) dto: BlockBedBody,
  ) {
    return this.wards.blockBed(requireTenant(user), id, dto);
  }

  @Post('beds/:id/unblock')
  @Permissions('ward:manage')
  unblockBed(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.wards.unblockBed(requireTenant(user), id);
  }

  // --- board -------------------------------------------------

  @Get('board')
  @Permissions('ward:read')
  @Audit('bed.board')
  board(@CurrentUser() user: AuthUser) {
    return this.wards.board(requireTenant(user));
  }

  // --- wards -----------------------------------------------

  @Get()
  @Permissions('ward:read')
  listWards(@CurrentUser() user: AuthUser) {
    return this.wards.listWards(requireTenant(user));
  }

  @Post()
  @Permissions('ward:manage')
  createWard(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createWardSchema)) dto: CreateWardBody,
  ) {
    return this.wards.createWard(requireTenant(user), dto);
  }

  @Patch(':id')
  @Permissions('ward:manage')
  updateWard(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateWardSchema)) dto: UpdateWardBody,
  ) {
    return this.wards.updateWard(requireTenant(user), id, dto);
  }

  @Delete(':id')
  @Permissions('ward:manage')
  removeWard(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.wards.removeWard(requireTenant(user), id);
  }
}
