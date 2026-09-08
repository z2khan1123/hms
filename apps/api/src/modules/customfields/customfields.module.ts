import { Module } from '@nestjs/common';
import { CustomFieldsController } from './customfields.controller.js';
import { CustomFieldsService } from './customfields.service.js';

@Module({
  controllers: [CustomFieldsController],
  providers: [CustomFieldsService],
  exports: [CustomFieldsService],
})
export class CustomFieldsModule {}
