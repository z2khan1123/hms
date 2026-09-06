import { Module } from '@nestjs/common';
import { VocabularyController } from './vocabulary.controller.js';
import { VocabularyService } from './vocabulary.service.js';

@Module({
  controllers: [VocabularyController],
  providers: [VocabularyService],
  exports: [VocabularyService],
})
export class VocabularyModule {}
