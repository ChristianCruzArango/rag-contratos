import { Module } from '@nestjs/common';
import { EmbeddingsModule } from '../embeddings/embeddings.module.js';
import { OcrModule } from '../ocr/ocr.module.js';
import { IngestController } from './ingest.controller.js';
import { IngestService } from './ingest.service.js';

@Module({
  imports: [EmbeddingsModule, OcrModule],
  controllers: [IngestController],
  providers: [IngestService],
  exports: [IngestService],
})
export class IngestModule {}
