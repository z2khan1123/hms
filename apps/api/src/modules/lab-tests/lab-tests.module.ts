import { Module } from '@nestjs/common';
import { LabTestsController } from './lab-tests.controller.js';
import { LabTestsService } from './lab-tests.service.js';

@Module({
  controllers: [LabTestsController],
  providers: [LabTestsService],
  exports: [LabTestsService],
})
export class LabTestsModule {}
