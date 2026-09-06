import { Global, Module } from '@nestjs/common';
import { SequenceService } from './sequence.service.js';

/** Global: patients, cases, OPD and billing all mint document numbers. */
@Global()
@Module({
  providers: [SequenceService],
  exports: [SequenceService],
})
export class SequenceModule {}
