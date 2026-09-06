import { Module } from '@nestjs/common';
import { VitalsController } from './vitals.controller.js';
import { VitalsService } from './vitals.service.js';

@Module({
  controllers: [VitalsController],
  providers: [VitalsService],
  exports: [VitalsService],
})
export class VitalsModule {}
