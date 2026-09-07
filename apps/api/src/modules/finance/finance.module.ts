import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller.js';
import { FinanceService } from './finance.service.js';
import { ReferralsController } from './referrals.controller.js';
import { ReferralsService } from './referrals.service.js';

@Module({
  controllers: [FinanceController, ReferralsController],
  providers: [FinanceService, ReferralsService],
  exports: [FinanceService, ReferralsService],
})
export class FinanceModule {}
