import { Module } from '@nestjs/common';
import { SequenceModule } from '../../common/sequence/sequence.module.js';
import { BillingModule } from '../billing/billing.module.js';
import { CasesModule } from '../cases/cases.module.js';
import { BloodBankController } from './bloodbank.controller.js';
import { BloodBankService } from './bloodbank.service.js';

@Module({
  imports: [SequenceModule, CasesModule, BillingModule],
  controllers: [BloodBankController],
  providers: [BloodBankService],
  exports: [BloodBankService],
})
export class BloodBankModule {}
