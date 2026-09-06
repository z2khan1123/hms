import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module.js';
import { CasesModule } from '../cases/cases.module.js';
import { AdmissionsController } from './admissions.controller.js';
import { AdmissionsService } from './admissions.service.js';

@Module({
  imports: [CasesModule, BillingModule],
  controllers: [AdmissionsController],
  providers: [AdmissionsService],
  exports: [AdmissionsService],
})
export class AdmissionsModule {}
