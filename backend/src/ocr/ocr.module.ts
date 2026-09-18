import { Module } from '@nestjs/common';
import { LlmModule } from '../llm/llm.module.js';
import { OcrService } from './ocr.service.js';

@Module({
  imports: [LlmModule],
  providers: [OcrService],
  exports: [OcrService],
})
export class OcrModule {}
