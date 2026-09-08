import { Module } from '@nestjs/common';
import { SequenceModule } from '../../common/sequence/sequence.module.js';
import { RegistersController } from './registers.controller.js';
import { RegistersService } from './registers.service.js';

@Module({
  imports: [SequenceModule],
  controllers: [RegistersController],
  providers: [RegistersService],
  exports: [RegistersService],
})
export class RegistersModule {}
