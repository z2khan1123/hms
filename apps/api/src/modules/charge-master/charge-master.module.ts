import { Module } from '@nestjs/common';
import { ChargeMasterController } from './charge-master.controller.js';
import { ChargeMasterService } from './charge-master.service.js';

@Module({
  controllers: [ChargeMasterController],
  providers: [ChargeMasterService],
  exports: [ChargeMasterService],
})
export class ChargeMasterModule {}
