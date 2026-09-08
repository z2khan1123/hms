import { Module } from '@nestjs/common';
import { SequenceModule } from '../../common/sequence/sequence.module.js';
import { FrontOfficeController } from './frontoffice.controller.js';
import { FrontOfficeService } from './frontoffice.service.js';

@Module({
  imports: [SequenceModule],
  controllers: [FrontOfficeController],
  providers: [FrontOfficeService],
  exports: [FrontOfficeService],
})
export class FrontOfficeModule {}
