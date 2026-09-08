import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import {
  analyticsQuerySchema,
  createSavedViewSchema,
  toCsv,
  updateSavedViewSchema,
  type AnalyticsQuery,
  type CreateSavedViewInput,
  type UpdateSavedViewInput,
} from '@hms/shared';
import { Audit } from '../../common/audit/audit.decorator.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { Permissions } from '../../common/auth/permissions.decorator.js';
import { requireTenant } from '../../common/auth/require-tenant.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AnalyticsService } from './analytics.service.js';

const savedViewListQuerySchema = z.object({
  dataset: z.string().max(60).optional(),
});
type SavedViewListQuery = z.infer<typeof savedViewListQuerySchema>;

/**
 * `analytics:read` guards the whole controller. It grants the SCREEN — each
 * dataset is separately gated by its own read permission inside the service,
 * so this decorator is the outer door, never the only lock.
 *
 * Every query is audited. A report is a bulk read of clinical and financial
 * data, and "who pulled the revenue by doctor last March" is exactly the
 * question an audit trail exists to answer.
 */
@Controller('analytics')
@Permissions('analytics:read')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('datasets')
  listDatasets(@CurrentUser() user: AuthUser) {
    return this.analytics.listDatasets(user);
  }

  @Post('query')
  @HttpCode(200)
  @Audit('analytics.query')
  run(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(analyticsQuerySchema)) dto: AnalyticsQuery,
  ) {
    return this.analytics.run(requireTenant(user), user, dto);
  }

  /**
   * Export. A POST because the query is a body, not a query string — and a
   * report definition is too big and too nested to survive a URL intact.
   */
  @Post('query/export')
  @HttpCode(200)
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="report.csv"')
  @Audit('analytics.export')
  async export(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(analyticsQuerySchema)) dto: AnalyticsQuery,
  ): Promise<string> {
    const result = await this.analytics.run(requireTenant(user), user, dto);
    return toCsv(result);
  }

  // --- saved views ------------------------------------------------

  @Get('views')
  listViews(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(savedViewListQuerySchema))
    query: SavedViewListQuery,
  ) {
    return this.analytics.listSavedViews(requireTenant(user), user, query.dataset);
  }

  @Post('views')
  createView(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createSavedViewSchema)) dto: CreateSavedViewInput,
  ) {
    return this.analytics.createSavedView(requireTenant(user), user, dto);
  }

  @Post('views/:id/run')
  @HttpCode(200)
  @Audit('analytics.view.run')
  runView(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.analytics.runSavedView(requireTenant(user), user, id);
  }

  @Patch('views/:id')
  updateView(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateSavedViewSchema)) dto: UpdateSavedViewInput,
  ) {
    return this.analytics.updateSavedView(requireTenant(user), user, id, dto);
  }

  @Delete('views/:id')
  deleteView(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.analytics.deleteSavedView(requireTenant(user), user, id);
  }
}
