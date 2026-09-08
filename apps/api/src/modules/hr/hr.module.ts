import { Module } from '@nestjs/common';
import { SequenceModule } from '../../common/sequence/sequence.module.js';
import { HrController } from './hr.controller.js';
import { HrService } from './hr.service.js';

@Module({
  imports: [SequenceModule],
  controllers: [HrController],
  providers: [HrService],
  exports: [HrService],
})
export class HrModule {}
