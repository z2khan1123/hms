import { Global, Module } from '@nestjs/common';
import { ApiKeyService } from './apikey.service.js';
import { IntegrationController } from './integration.controller.js';
import { WebhookDispatcher } from './webhook.dispatcher.js';
import { WebhookService } from './webhook.service.js';

/**
 * Global because two things reach across the whole app: `ApiKeyService` is
 * needed by the context middleware before any module is resolved, and
 * `WebhookService.enqueueInTx` is called from inside other modules'
 * transactions.
 */
@Global()
@Module({
  controllers: [IntegrationController],
  providers: [ApiKeyService, WebhookService, WebhookDispatcher],
  exports: [ApiKeyService, WebhookService],
})
export class IntegrationModule {}
