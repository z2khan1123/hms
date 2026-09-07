import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  Query,
} from '@nestjs/common';
import {
  type SaveDiagnosticReportInput,
  diagnosticReportListQuerySchema,
  saveDiagnosticReportSchema,
} from '@hms/shared';
import { Audit } from '../../common/audit/audit.decorator.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { Permissions } from '../../common/auth/permissions.decorator.js';
import { requireTenant } from '../../common/auth/require-tenant.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import {
  type DiagnosticReportListFilter,
  DiagnosticsService,
} from './diagnostics.service.js';

/**
 * `/reports/by-order/:serviceOrderId` is declared before `/reports/:id` so the
 * param route never swallows it.
 */
@Controller('reports')
export class ReportsController {
  constructor(private readonly diagnostics: DiagnosticsService) {}

  @Get()
  @Permissions('report:read')
  @Audit('report.list')
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(diagnosticReportListQuerySchema))
    query: DiagnosticReportListFilter,
  ) {
    return this.diagnostics.list(requireTenant(user), query);
  }

  @Get('by-order/:serviceOrderId')
  @Permissions('report:read')
  @Audit('report.read')
  getByOrder(
    @CurrentUser() user: AuthUser,
    @Param('serviceOrderId', ParseUUIDPipe) serviceOrderId: string,
  ) {
    return this.diagnostics.getByOrder(requireTenant(user), serviceOrderId);
  }

  @Put('by-order/:serviceOrderId')
  @Permissions('report:write')
  save(
    @CurrentUser() user: AuthUser,
    @Param('serviceOrderId', ParseUUIDPipe) serviceOrderId: string,
    @Body(new ZodValidationPipe(saveDiagnosticReportSchema))
    dto: SaveDiagnosticReportInput,
  ) {
    return this.diagnostics.saveByOrder(
      requireTenant(user),
      user.id,
      serviceOrderId,
      dto,
    );
  }

  @Get(':id')
  @Permissions('report:read')
  @Audit('report.read')
  get(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.diagnostics.get(requireTenant(user), id);
  }
}
