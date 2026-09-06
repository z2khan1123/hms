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
  caseListQuerySchema,
  closeCaseSchema,
  type OpenCaseInput,
  openCaseSchema,
} from '@hms/shared';
import { Audit } from '../../common/audit/audit.decorator.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { Permissions } from '../../common/auth/permissions.decorator.js';
import { requireTenant } from '../../common/auth/require-tenant.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { type CaseListFilter, CasesService } from './cases.service.js';

@Controller('cases')
export class CasesController {
  constructor(private readonly cases: CasesService) {}

  @Post()
  @Permissions('case:create')
  open(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(openCaseSchema)) dto: OpenCaseInput,
  ) {
    return this.cases.open(requireTenant(user), user.id, dto);
  }

  @Get()
  @Permissions('case:read')
  @Audit('case.list')
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(caseListQuerySchema)) query: CaseListFilter,
  ) {
    return this.cases.list(requireTenant(user), query);
  }

  @Get(':id')
  @Permissions('case:read')
  @Audit('case.read')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.cases.get(requireTenant(user), id);
  }

  @Post(':id/close')
  @Permissions('case:close')
  close(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(closeCaseSchema)) dto: { reason?: string },
  ) {
    return this.cases.close(requireTenant(user), id, dto.reason);
  }
}
