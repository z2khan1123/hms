import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module.js';
import { CasesModule } from '../cases/cases.module.js';
import { OrdersController } from './orders.controller.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [BillingModule, CasesModule],
  controllers: [OrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
