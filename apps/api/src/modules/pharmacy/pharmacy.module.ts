import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module.js';
import { CasesModule } from '../cases/cases.module.js';
import { PharmacyController } from './pharmacy.controller.js';
import { PharmacyService } from './pharmacy.service.js';

@Module({
  imports: [BillingModule, CasesModule],
  controllers: [PharmacyController],
  providers: [PharmacyService],
  exports: [PharmacyService],
})
export class PharmacyModule {}
