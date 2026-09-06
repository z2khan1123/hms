import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import {
  type AdmitPatientInput,
  admitPatientSchema,
  admissionListQuerySchema,
  type CreateNurseNoteInput,
  createNurseNoteSchema,
  type DischargeInput,
  dischargeSchema,
  revertDischargeSchema,
  type TransferBedInput,
  transferBedSchema,
} from '@hms/shared';
import { Audit } from '../../common/audit/audit.decorator.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { Permissions } from '../../common/auth/permissions.decorator.js';
import { requireTenant } from '../../common/auth/require-tenant.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import {
  type AdmissionListFilter,
  AdmissionsService,
} from './admissions.service.js';

@Controller('admissions')
export class AdmissionsController {
  constructor(private readonly admissions: AdmissionsService) {}

  @Post()
  @Permissions('admission:create')
  admit(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(admitPatientSchema)) dto: AdmitPatientInput,
  ) {
    return this.admissions.admit(requireTenant(user), user.id, dto);
  }

  @Get()
  @Permissions('admission:read')
  @Audit('admission.list')
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(admissionListQuerySchema))
    query: AdmissionListFilter,
  ) {
    return this.admissions.list(requireTenant(user), query);
  }

  @Get(':id')
  @Permissions('admission:read')
  @Audit('admission.read')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.admissions.get(requireTenant(user), id);
  }

  @Post(':id/transfer')
  @Permissions('admission:transfer')
  transfer(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(transferBedSchema)) dto: TransferBedInput,
  ) {
    return this.admissions.transfer(requireTenant(user), user.id, id, dto);
  }

  @Post(':id/discharge')
  @Permissions('admission:discharge')
  discharge(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(dischargeSchema)) dto: DischargeInput,
  ) {
    return this.admissions.discharge(requireTenant(user), user.id, id, dto);
  }

  @Post(':id/revert-discharge')
  @Permissions('admission:discharge')
  revertDischarge(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(revertDischargeSchema)) dto: { reason: string },
  ) {
    return this.admissions.revertDischarge(
      requireTenant(user),
      user.id,
      id,
      dto.reason,
    );
  }

  @Get(':id/nurse-notes')
  @Permissions('nursenote:read')
  @Audit('nursenote.read')
  listNurseNotes(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.admissions.listNurseNotes(requireTenant(user), id);
  }

  @Post(':id/nurse-notes')
  @Permissions('nursenote:write')
  addNurseNote(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(createNurseNoteSchema)) dto: CreateNurseNoteInput,
  ) {
    return this.admissions.addNurseNote(
      requireTenant(user),
      user.id,
      id,
      dto,
    );
  }
}
