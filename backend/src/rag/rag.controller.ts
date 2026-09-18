import { Body, Controller, Get, Post, Query, Sse } from '@nestjs/common';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Observable } from 'rxjs';
import { RagService } from './rag.service.js';
import { DatabaseService } from '../database/database.service.js';

class AskDto {
  @IsString() @MinLength(3) question!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(30) topK?: number;
  @IsOptional() @IsString() docType?: string;
}

class SearchDto {
  @IsString() @MinLength(2) q!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(30) topK?: number;
  @IsOptional() @IsString() docType?: string;
}

class VectorSpaceDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(30) topK?: number;
  /** Cuántos fragmentos se muestrean para dibujar la nube. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(40)
  @Max(600)
  muestra?: number;
}

@Controller('rag')
export class RagController {
  constructor(
    private readonly rag: RagService,
    private readonly db: DatabaseService,
  ) {}

  @Get('health')
  async health() {
    return { status: 'ok', ...(await this.db.health()) };
  }

  /** El esquema real de la tabla `chunks`, leído del catálogo de Postgres. */
  @Get('schema')
  schema() {
    return this.rag.esquema();
  }

  @Get('stats')
  stats() {
    return this.rag.stats();
  }

  /** Recuperación sin LLM: útil para evaluar la calidad del retriever. */
  @Get('search')
  search(@Query() dto: SearchDto) {
    return this.rag.search(dto.q, { topK: dto.topK, docType: dto.docType });
  }

  @Get('search/vector')
  searchVector(@Query() dto: SearchDto) {
    return this.rag.searchVector(dto.q, dto.topK ?? 8);
  }

  /**
   * Muestra del espacio vectorial de pgvector proyectada a 2D (PCA).
   * Con `q`, además devuelve dónde cae la consulta y su coseno con cada punto.
   */
  @Get('vector-space')
  vectorSpace(@Query() dto: VectorSpaceDto) {
    return this.rag.vectorSpace(dto);
  }

  @Post('ask')
  ask(@Body() dto: AskDto) {
    return this.rag.ask(dto.question, {
      topK: dto.topK,
      docType: dto.docType,
    });
  }

  /**
   * El pipeline de consulta narrado paso a paso por SSE: embedding de la
   * pregunta, los dos buscadores, la fusión RRF, el prompt y los tokens.
   */
  @Sse('ask/explain')
  askExplain(@Query() dto: SearchDto): Observable<{ data: string }> {
    const gen = this.rag.askExplain(dto.q, {
      topK: dto.topK,
      docType: dto.docType,
    });
    return new Observable((subscriber) => {
      let vivo = true;
      (async () => {
        try {
          for await (const evento of gen) {
            if (!vivo) return;
            subscriber.next({ data: JSON.stringify(evento) });
          }
        } catch (err) {
          subscriber.next({
            data: JSON.stringify({
              fase: 'error',
              mensaje: (err as Error).message,
            }),
          });
        }
        subscriber.complete();
      })();
      return () => {
        vivo = false;
      };
    });
  }

  /** Respuesta en streaming por Server-Sent Events. */
  @Sse('ask/stream')
  askStream(@Query() dto: SearchDto): Observable<{ data: string }> {
    const gen = this.rag.askStream(dto.q, {
      topK: dto.topK,
      docType: dto.docType,
    });
    return new Observable((subscriber) => {
      (async () => {
        try {
          for await (const event of gen) {
            subscriber.next({ data: JSON.stringify(event) });
          }
          subscriber.complete();
        } catch (err) {
          subscriber.next({
            data: JSON.stringify({
              type: 'error',
              data: (err as Error).message,
            }),
          });
          subscriber.complete();
        }
      })();
    });
  }
}
