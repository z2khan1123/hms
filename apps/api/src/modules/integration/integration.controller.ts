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
import { z } from 'zod';
import {
  WEBHOOK_EVENTS,
  WEBHOOK_EVENT_LABELS,
  type CreateApiKeyInput,
  type CreateWebhookInput,
  type UpdateApiKeyInput,
  type UpdateWebhookInput,
  apiKeyListQuerySchema,
  createApiKeySchema,
  createWebhookSchema,
  deliveryListQuerySchema,
  deliveryStatusSchema,
  updateApiKeySchema,
  updateWebhookSchema,
  webhookEventSchema,
} from '@hms/shared';
import { Audit } from '../../common/audit/audit.decorator.js';
import type { AuthUser } from '../../common/auth/auth-user.js';
import { CurrentUser } from '../../common/auth/current-user.decorator.js';
import { Permissions } from '../../common/auth/permissions.decorator.js';
import { requireTenant } from '../../common/auth/require-tenant.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { ApiKeyService } from './apikey.service.js';
import { WebhookService } from './webhook.service.js';

type ApiKeyListQuery = z.infer<typeof apiKeyListQuerySchema>;
type DeliveryListQuery = z.infer<typeof deliveryListQuerySchema>;

/**
 * Issuing a key hands out standing access, and a webhook sends patient data
 * off-site. Both are hospital-admin territory, and every action here is
 * audited — "who gave that system access, and when" is the first question
 * after any integration goes wrong.
 */
@Controller('integration')
export class IntegrationController {
  constructor(
    private readonly apiKeys: ApiKeyService,
    private readonly webhooks: WebhookService,
  ) {}

  // --- API keys ---------------------------------------------------

  @Get('api-keys')
  @Permissions('apikey:read')
  @Audit('apikey.list')
  listKeys(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(apiKeyListQuerySchema)) query: ApiKeyListQuery,
  ) {
    return this.apiKeys.list(requireTenant(user), query.includeRevoked ?? false);
  }

  @Post('api-keys')
  @Permissions('apikey:manage')
  @Audit('apikey.create')
  createKey(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createApiKeySchema)) dto: CreateApiKeyInput,
  ) {
    return this.apiKeys.create(requireTenant(user), user.id, dto);
  }

  @Patch('api-keys/:id')
  @Permissions('apikey:manage')
  @Audit('apikey.update')
  updateKey(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateApiKeySchema)) dto: UpdateApiKeyInput,
  ) {
    return this.apiKeys.update(requireTenant(user), id, dto);
  }

  @Post('api-keys/:id/revoke')
  @Permissions('apikey:manage')
  @HttpCode(200)
  @Audit('apikey.revoke')
  revokeKey(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.apiKeys.revoke(requireTenant(user), id);
  }

  // --- webhooks ---------------------------------------------------

  /** The catalogue an integrator picks from. */
  @Get('webhook-events')
  @Permissions('webhook:read')
  listEvents() {
    return WEBHOOK_EVENTS.map((e) => ({ event: e, label: WEBHOOK_EVENT_LABELS[e] }));
  }

  @Get('webhooks')
  @Permissions('webhook:read')
  @Audit('webhook.list')
  listWebhooks(@CurrentUser() user: AuthUser) {
    return this.webhooks.list(requireTenant(user));
  }

  @Post('webhooks')
  @Permissions('webhook:manage')
  @Audit('webhook.create')
  createWebhook(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createWebhookSchema)) dto: CreateWebhookInput,
  ) {
    return this.webhooks.create(requireTenant(user), user.id, dto);
  }

  @Patch('webhooks/:id')
  @Permissions('webhook:manage')
  @Audit('webhook.update')
  updateWebhook(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(updateWebhookSchema)) dto: UpdateWebhookInput,
  ) {
    return this.webhooks.update(requireTenant(user), id, dto);
  }

  @Post('webhooks/:id/rotate-secret')
  @Permissions('webhook:manage')
  @HttpCode(200)
  @Audit('webhook.rotate')
  rotateSecret(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.webhooks.rotateSecret(requireTenant(user), id);
  }

  @Delete('webhooks/:id')
  @Permissions('webhook:manage')
  @Audit('webhook.delete')
  deleteWebhook(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.webhooks.remove(requireTenant(user), id);
  }

  // --- deliveries -------------------------------------------------

  @Get('deliveries')
  @Permissions('webhook:read')
  listDeliveries(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(deliveryListQuerySchema)) query: DeliveryListQuery,
  ) {
    return this.webhooks.listDeliveries(requireTenant(user), {
      webhookId: query.webhookId,
      status: query.status
        ? deliveryStatusSchema.parse(query.status)
        : undefined,
      event: query.event ? webhookEventSchema.parse(query.event) : undefined,
    });
  }

  @Post('deliveries/:id/retry')
  @Permissions('webhook:manage')
  @HttpCode(200)
  @Audit('webhook.retry')
  retryDelivery(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.webhooks.retry(requireTenant(user), id);
  }
}
