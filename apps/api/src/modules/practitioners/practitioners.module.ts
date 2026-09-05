import { Module } from '@nestjs/common';
import { PractitionersController } from './practitioners.controller.js';
import { PractitionersService } from './practitioners.service.js';

@Module({
  controllers: [PractitionersController],
  providers: [PractitionersService],
  exports: [PractitionersService],
})
export class PractitionersModule {}
