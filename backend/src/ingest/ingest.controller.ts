import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import type { PipelineEvent } from '../pipeline/pipeline.types.js';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { resolve } from 'node:path';
import { IngestService } from './ingest.service.js';
import type { UploadedTextFile } from './ingest.types.js';

class IngestTextDto {
  @IsString() @MinLength(3) title!: string;
  @IsString() @MinLength(20) content!: string;
  @IsOptional() @IsString() docType?: string;
  @IsOptional() @IsString() source?: string;
}

class IngestDirDto {
  @IsOptional() @IsString() dir?: string;
}

@Controller('documents')
export class IngestController {
  constructor(private readonly ingest: IngestService) {}

  @Get()
  list() {
    return this.ingest.list();
  }

  /** Indexa texto plano enviado en el cuerpo. */
  @Post('text')
  ingestText(@Body() dto: IngestTextDto) {
    return this.ingest.ingestText(dto);
  }

  /**
   * Indexa un archivo subido como multipart/form-data.
   * Acepta PDF (nativo o escaneado), texto plano e imágenes (se les aplica OCR).
   * `ocr=false` desactiva el OCR para este archivo concreto.
   */
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @UploadedFile() file: UploadedTextFile,
    @Body('docType') docType?: string,
    @Body('ocr') ocr?: string,
  ) {
    if (!file) throw new BadRequestException('No se recibió ningún archivo');
    return this.ingest.ingestFile({
      filename: file.originalname,
      buffer: file.buffer,
      docType,
      ...(ocr !== undefined ? { ocr: ocr !== 'false' } : {}),
    });
  }

  /**
   * Igual que `upload`, pero narrando el pipeline mientras ocurre.
   *
   * Responde NDJSON (un evento JSON por línea) en lugar de SSE porque el
   * navegador no puede abrir un `EventSource` con POST + multipart: el cliente
   * lee el cuerpo con `fetch` y un `ReadableStream`.
   */
  @Post('upload/stream')
  @UseInterceptors(FileInterceptor('file'))
  async uploadStream(
    @Res() res: Response,
    @UploadedFile() file: UploadedTextFile,
    @Body('docType') docType?: string,
    @Body('ocr') ocr?: string,
  ) {
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const emitir = (evento: PipelineEvent) => {
      if (!res.writableEnded) res.write(JSON.stringify(evento) + '\n');
    };

    if (!file) {
      emitir({ fase: 'error', mensaje: 'No se recibió ningún archivo' });
      return res.end();
    }

    try {
      await this.ingest.ingestFile({
        filename: file.originalname,
        buffer: file.buffer,
        docType,
        ...(ocr !== undefined ? { ocr: ocr !== 'false' } : {}),
        report: emitir,
      });
    } catch (err) {
      emitir({ fase: 'error', mensaje: (err as Error).message });
    }
    res.end();
  }

  /** Indexa la carpeta seed-data/ con los 10 contratos de prueba. */
  @Post('seed')
  seed(@Body() dto: IngestDirDto) {
    const dir = dto.dir
      ? resolve(dto.dir)
      : resolve(process.cwd(), '..', 'seed-data');
    return this.ingest.ingestDirectory(dir);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.ingest.remove(id);
  }
}
