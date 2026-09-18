import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import type { EmbeddingProgress, Provider } from './embeddings.types.js';

/**
 * Genera embeddings con uno de dos proveedores:
 *
 *  - `local`  : modelo multilingüe ejecutado en esta máquina (transformers.js).
 *               Gratis, sin API key y sin enviar nada fuera. Es el que se usa
 *               automáticamente cuando no hay EMBEDDING_API_KEY configurada.
 *  - `openai` : cualquier endpoint compatible con la API de OpenAI
 *               (OpenAI, Ollama, DeepInfra, Jina…).
 *
 * IMPORTANTE: OpenRouter NO expone /v1/embeddings — verificado contra su
 * catálogo (445 modelos, ninguno de embeddings). Por eso este servicio nunca
 * usa la configuración de OpenRouter.
 */
@Injectable()
export class EmbeddingsService implements OnModuleInit {
  private readonly logger = new Logger(EmbeddingsService.name);

  private provider!: Provider;
  private model!: string;
  private batchSize!: number;
  dimensions!: number;

  private client?: OpenAI;
  private extractor?: unknown;
  private loading?: Promise<unknown>;
  /** Los modelos E5 exigen prefijos distintos para consulta y documento. */
  private usaPrefijosE5 = false;

  constructor(private readonly config: ConfigService) {}

  /** Identificador del modelo en uso, para mostrarlo en la interfaz. */
  get modelName(): string {
    return this.model;
  }

  /** 'local' o 'openai'. */
  get providerName(): Provider {
    return this.provider;
  }

  onModuleInit() {
    const apiKey = this.config.get<string>('embeddings.apiKey') ?? '';
    const declarado = this.config.get<string>('embeddings.provider');

    // Sin API key real no se puede usar un proveedor remoto: se cae a local.
    const sinKey = !apiKey || apiKey.includes('CAMBIA_ESTO');
    this.provider = (declarado as Provider) || (sinKey ? 'local' : 'openai');

    if (this.provider === 'openai' && sinKey) {
      this.logger.warn(
        'EMBEDDING_API_KEY no configurada: se usará el proveedor local.',
      );
      this.provider = 'local';
    }

    this.batchSize = this.config.get<number>('embeddings.batchSize')!;

    if (this.provider === 'local') {
      this.model = this.config.get<string>('embeddings.localModel')!;
      this.dimensions = this.config.get<number>('embeddings.dimensions')!;
      this.usaPrefijosE5 = /e5/i.test(this.model);
      this.logger.log(
        `Embeddings locales: ${this.model} (${this.dimensions}d, sin coste)`,
      );
    } else {
      this.model = this.config.get<string>('embeddings.model')!;
      this.dimensions = this.config.get<number>('embeddings.dimensions')!;
      this.client = new OpenAI({
        apiKey,
        baseURL: this.config.get<string>('embeddings.baseUrl')!,
      });
      this.logger.log(
        `Embeddings remotos: ${this.model} @ ${this.config.get('embeddings.baseUrl')} (${this.dimensions}d)`,
      );
    }
  }

  /**
   * Embeddings de los fragmentos que se van a indexar.
   * `onProgress` se invoca al terminar cada lote.
   */
  embedDocuments(
    texts: string[],
    onProgress?: EmbeddingProgress,
  ): Promise<number[][]> {
    return this.embed(texts, 'passage', onProgress);
  }

  /** Embedding de una consulta de búsqueda. */
  async embedQuery(text: string): Promise<number[]> {
    const [v] = await this.embed([text], 'query');
    return v;
  }

  /** Alias de embedQuery(): un único texto tratado como consulta. */
  embedOne(text: string): Promise<number[]> {
    return this.embedQuery(text);
  }

  /** Alias de embedDocuments(). */
  embedMany(
    texts: string[],
    onProgress?: EmbeddingProgress,
  ): Promise<number[][]> {
    return this.embedDocuments(texts, onProgress);
  }

  /** Formato que pgvector espera como literal: '[0.1,0.2,…]' */
  toVectorLiteral(embedding: number[]): string {
    return `[${embedding.join(',')}]`;
  }

  private async embed(
    texts: string[],
    tipo: 'query' | 'passage',
    onProgress?: EmbeddingProgress,
  ): Promise<number[][]> {
    const lotes = Math.max(1, Math.ceil(texts.length / this.batchSize));
    const out: number[][] = [];

    for (let i = 0; i < texts.length; i += this.batchSize) {
      const t0 = Date.now();
      const lote = texts.slice(i, i + this.batchSize);
      const vectores =
        this.provider === 'local'
          ? await this.embedLocal(lote, tipo)
          : await this.embedRemoto(lote);

      out.push(...vectores);
      onProgress?.({
        lote: Math.floor(i / this.batchSize) + 1,
        lotes,
        hechos: out.length,
        total: texts.length,
        ms: Date.now() - t0,
        vectores,
      });
    }
    return out;
  }

  // ------------------------------------------------------------ local

  private async getExtractor() {
    if (this.extractor) return this.extractor;
    this.loading ??= (async () => {
      const { pipeline } = await import('@huggingface/transformers');
      this.logger.log(`Cargando modelo local ${this.model}…`);
      const ex = await pipeline('feature-extraction', this.model);
      this.extractor = ex;
      this.logger.log('Modelo local listo');
      return ex;
    })();
    return this.loading;
  }

  private async embedLocal(
    texts: string[],
    tipo: 'query' | 'passage',
  ): Promise<number[][]> {
    const extractor = (await this.getExtractor()) as (
      input: string[],
      opts: Record<string, unknown>,
    ) => Promise<{ tolist(): number[][] }>;

    const prep = this.usaPrefijosE5 ? texts.map((t) => `${tipo}: ${t}`) : texts;
    const res = await extractor(prep, { pooling: 'mean', normalize: true });
    return res.tolist();
  }

  // ----------------------------------------------------------- remoto

  private async embedRemoto(texts: string[]): Promise<number[][]> {
    const res = await this.withRetry(() =>
      this.client!.embeddings.create({
        model: this.model,
        input: texts,
        // Solo los modelos v3 de OpenAI aceptan `dimensions`.
        ...(this.model.startsWith('text-embedding-3')
          ? { dimensions: this.dimensions }
          : {}),
      }),
    );
    // La API no garantiza el orden: se reordena por `index`.
    return [...res.data]
      .sort((a, b) => a.index - b.index)
      .map((d) => d.embedding as number[]);
  }

  private async withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        const wait = 2 ** i * 1000;
        this.logger.warn(
          `Fallo al generar embeddings (intento ${i + 1}/${attempts}), reintentando en ${wait}ms`,
        );
        await new Promise((r) => setTimeout(r, wait));
      }
    }
    throw lastErr;
  }
}
