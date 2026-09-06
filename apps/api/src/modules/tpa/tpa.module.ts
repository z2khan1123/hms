import { Module } from '@nestjs/common';
import { TpaController } from './tpa.controller.js';
import { TpaService } from './tpa.service.js';

@Module({
  controllers: [TpaController],
  providers: [TpaService],
  exports: [TpaService],
})
export class TpaModule {}
