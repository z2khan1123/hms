import { Module } from '@nestjs/common';
import { ReportsController } from './diagnostics.controller.js';
import { DiagnosticsService } from './diagnostics.service.js';

@Module({
  controllers: [ReportsController],
  providers: [DiagnosticsService],
  exports: [DiagnosticsService],
})
export class DiagnosticsModule {}
