import { Module } from '@nestjs/common';
import { SequenceModule } from '../../common/sequence/sequence.module.js';
import { BillingModule } from '../billing/billing.module.js';
import { CasesModule } from '../cases/cases.module.js';
import { AmbulanceController } from './ambulance.controller.js';
import { AmbulanceService } from './ambulance.service.js';

@Module({
  imports: [SequenceModule, CasesModule, BillingModule],
  controllers: [AmbulanceController],
  providers: [AmbulanceService],
  exports: [AmbulanceService],
})
export class AmbulanceModule {}
