import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module.js';
import { CasesModule } from '../cases/cases.module.js';
import { OpdController } from './opd.controller.js';
import { OpdService } from './opd.service.js';

@Module({
  imports: [CasesModule, BillingModule],
  controllers: [OpdController],
  providers: [OpdService],
  exports: [OpdService],
})
export class OpdModule {}
