import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import appConfig from './config/app.config.js';
import databaseConfig from './config/database.config.js';
import embeddingsConfig from './config/embeddings.config.js';
import ocrConfig from './config/ocr.config.js';
import openrouterConfig from './config/openrouter.config.js';
import ragConfig from './config/rag.config.js';
import { validate } from './config/env.validation.js';
import { DatabaseModule } from './database/database.module.js';
import { IngestModule } from './ingest/ingest.module.js';
import { RagModule } from './rag/rag.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [
        appConfig,
        databaseConfig,
        openrouterConfig,
        embeddingsConfig,
        ocrConfig,
        ragConfig,
      ],
      // El entorno se valida al arrancar: si falta algo, el proceso no sube.
      validate,
      // .env en backend/ o en la raíz del proyecto (el mismo que usa Docker)
      envFilePath: ['.env', '../.env'],
    }),
    DatabaseModule,
    IngestModule,
    RagModule,
  ],
})
export class AppModule {}
