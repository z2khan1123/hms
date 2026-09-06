import { Module } from '@nestjs/common';
import { WardsController } from './wards.controller.js';
import { WardsService } from './wards.service.js';

@Module({
  controllers: [WardsController],
  providers: [WardsService],
  exports: [WardsService],
})
export class WardsModule {}
