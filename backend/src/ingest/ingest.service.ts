import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join, basename } from 'node:path';
import { DatabaseService } from '../database/database.service.js';
import { EmbeddingsService } from '../embeddings/embeddings.service.js';
import { chunkText, estimateTokens } from './chunker.js';
import { extractPdf, joinPages } from './pdf.js';
import { OcrService } from '../ocr/ocr.service.js';
import type { IngestResult } from './ingest.types.js';
import type {
  ChunkMuestra,
  PaginaInfo,
  PipelineReporter,
} from '../pipeline/pipeline.types.js';

@Injectable()
export class IngestService {
  private readonly logger = new Logger(IngestService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly embeddings: EmbeddingsService,
    private readonly ocr: OcrService,
    private readonly config: ConfigService,
  ) {}

  /** Indexa un texto: lo trocea, genera embeddings y lo guarda. */
  async ingestText(params: {
    title: string;
    content: string;
    docType?: string;
    source?: string;
    metadata?: Record<string, unknown>;
    ocrPages?: number[];
    /** Observador opcional del pipeline (lo usa el endpoint en streaming). */
    report?: PipelineReporter;
    /**
     * Momento en que empezó el trabajo, si arrancó antes (extracción y OCR
     * ocurren fuera de este método). Sin él, el total sólo cuenta desde aquí.
     */
    inicio?: number;
  }): Promise<IngestResult> {
    const t0 = params.inicio ?? Date.now();
    const avisar = params.report;
    const checksum = createHash('sha256').update(params.content).digest('hex');

    const existing = await this.db.query<{ id: string; chunk_count: number }>(
      'SELECT id, chunk_count FROM documents WHERE checksum = $1',
      [checksum],
    );
    if (existing.length) {
      this.logger.log(`"${params.title}" ya indexado, se omite.`);
      avisar?.({
        fase: 'ingesta-lista',
        documentId: existing[0].id,
        titulo: params.title,
        fragmentos: existing[0].chunk_count,
        omitido: true,
        ms: Date.now() - t0,
      });
      return {
        documentId: existing[0].id,
        title: params.title,
        chunks: existing[0].chunk_count,
        skipped: true,
      };
    }

    const chunkSize = this.config.get<number>('rag.chunkSize')!;
    const overlap = this.config.get<number>('rag.chunkOverlap')!;

    const tTroceo = Date.now();
    const chunks = chunkText(params.content, {
      chunkSize,
      overlap,
      ocrPages: params.ocrPages,
    });
    this.logger.log(`"${params.title}": ${chunks.length} fragmentos`);

    avisar?.({
      fase: 'troceo',
      total: chunks.length,
      chunkSize,
      overlap,
      secciones: new Set(
        chunks.map((c) => (c.metadata['seccion'] as string) ?? '—'),
      ).size,
      conOcr: chunks.filter((c) => c.metadata['ocr'] === true).length,
      muestras: muestrasDe(chunks),
      ms: Date.now() - tTroceo,
    });

    const dimensiones = this.embeddings.dimensions;
    const vectors = await this.embeddings.embedDocuments(
      chunks.map((c) => c.content),
      (info) =>
        avisar?.({
          fase: 'embeddings-lote',
          lote: info.lote,
          lotes: info.lotes,
          hechos: info.hechos,
          total: info.total,
          modelo: this.embeddings.modelName,
          dimensiones,
          ms: info.ms,
          // Primeras 96 dimensiones del primer vector: suficiente para verlo.
          muestra: (info.vectores[0] ?? []).slice(0, 96),
        }),
    );

    const tGuardado = Date.now();
    return this.db.transaction(async (client) => {
      const doc = await client.query<{ id: string }>(
        `INSERT INTO documents (title, source, doc_type, content, metadata, checksum, chunk_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [
          params.title,
          params.source ?? null,
          params.docType ?? null,
          params.content,
          JSON.stringify(params.metadata ?? {}),
          checksum,
          chunks.length,
        ],
      );
      const documentId = doc.rows[0].id;

      // Inserción por lotes para no saturar el driver con 1 query por chunk.
      const BATCH = 200;
      for (let i = 0; i < chunks.length; i += BATCH) {
        const slice = chunks.slice(i, i + BATCH);
        const values: unknown[] = [];
        const rows = slice.map((c, j) => {
          const b = j * 6;
          values.push(
            documentId,
            c.index,
            c.content,
            estimateTokens(c.content),
            JSON.stringify(c.metadata),
            this.embeddings.toVectorLiteral(vectors[i + j]),
          );
          return `($${b + 1}, $${b + 2}, $${b + 3}, $${b + 4}, $${b + 5}::jsonb, $${b + 6}::vector)`;
        });
        await client.query(
          `INSERT INTO chunks (document_id, chunk_index, content, token_count, metadata, embedding)
           VALUES ${rows.join(', ')}`,
          values,
        );
      }

      avisar?.({
        fase: 'almacenado',
        documentId,
        filas: chunks.length,
        tabla: 'chunks',
        indice: 'hnsw (vector_cosine_ops, m=16, ef_construction=64)',
        dimensiones,
        ms: Date.now() - tGuardado,
      });
      avisar?.({
        fase: 'ingesta-lista',
        documentId,
        titulo: params.title,
        fragmentos: chunks.length,
        omitido: false,
        ms: Date.now() - t0,
      });

      return {
        documentId,
        title: params.title,
        chunks: chunks.length,
        skipped: false,
      };
    });
  }

  /**
   * Indexa un archivo binario. Los PDF se extraen página por página; el resto
   * se interpreta como texto plano UTF-8.
   */
  async ingestFile(params: {
    filename: string;
    buffer: Buffer;
    docType?: string;
    title?: string;
    metadata?: Record<string, unknown>;
    /** Fuerza (o desactiva) el OCR para este archivo concreto. */
    ocr?: boolean;
    /** Observador opcional del pipeline. */
    report?: PipelineReporter;
  }): Promise<IngestResult> {
    const t0 = Date.now();
    const avisar = params.report;
    const ext = extname(params.filename).toLowerCase();
    const esPdf =
      ext === '.pdf' ||
      params.buffer.subarray(0, 4).toString('latin1') === '%PDF';
    const esImagen = [
      '.png',
      '.jpg',
      '.jpeg',
      '.tif',
      '.tiff',
      '.webp',
    ].includes(ext);

    avisar?.({
      fase: 'recepcion',
      archivo: params.filename,
      bytes: params.buffer.byteLength,
      formato: esPdf ? 'pdf' : esImagen ? 'imagen' : 'texto',
    });

    let content: string;
    let extra: Record<string, unknown> = {};
    let ocrPages: number[] = [];

    if (esPdf) {
      const tExtraccion = Date.now();
      const pdf = await extractPdf(params.buffer);
      let pageTexts = pdf.pageTexts;

      const minChars = this.config.get<number>('ocr.minChars')!;
      const paginas: PaginaInfo[] = pageTexts.map((t, i) => {
        const caracteres = t.replace(/\s/g, '').length;
        return { n: i + 1, caracteres, vacia: caracteres < minChars };
      });
      avisar?.({
        fase: 'extraccion',
        paginas,
        caracteres: paginas.reduce((a, p) => a + p.caracteres, 0),
        vacias: paginas.filter((p) => p.vacia).length,
        ms: Date.now() - tExtraccion,
      });

      // Un PDF escaneado trae páginas sin capa de texto: se completan por OCR.
      if (params.ocr !== false) {
        const { pages, report } = await this.ocr.ocrPdfPages({
          buffer: params.buffer,
          pages: pageTexts,
          ...(avisar ? { report: avisar } : {}),
        });
        pageTexts = pages;
        ocrPages = report.paginas_ocr;
        extra = { ocr: report };
        if (report.aplicado) {
          this.logger.log(
            `OCR aplicado a ${report.paginas_ocr.length} páginas de "${params.filename}" ` +
              `(confianza media: ${report.confianza_media ?? 'n/d'})`,
          );
        }
      }

      content = joinPages(pageTexts);
      extra = { ...extra, paginas_pdf: pageTexts.length, pdf_info: pdf.info };
      this.logger.log(`PDF "${params.filename}": ${pageTexts.length} páginas`);
    } else if (esImagen) {
      // Una imagen solo tiene texto si se reconoce.
      avisar?.({
        fase: 'extraccion',
        paginas: [{ n: 1, caracteres: 0, vacia: true }],
        caracteres: 0,
        vacias: 1,
        ms: 0,
      });
      avisar?.({
        fase: 'ocr-plan',
        modo: 'imagen',
        motor: this.config.get<string>('ocr.engine')!,
        minChars: 0,
        objetivo: [1],
        omitidas: 0,
        innecesario: false,
      });
      const r = await this.ocr.recognizeImage(params.buffer);
      avisar?.({
        fase: 'ocr-pagina',
        pagina: 1,
        confianza: r.confidence,
        caracteres: r.text.length,
        ms: r.durationMs,
        muestra: r.text.replace(/\s+/g, ' ').trim().slice(0, 260),
      });
      content = r.text;
      ocrPages = [1];
      extra = {
        ocr: {
          aplicado: true,
          motor: r.engine,
          modo: 'imagen',
          paginas_ocr: [1],
          paginas_totales: 1,
          confianza_media: r.confidence,
          paginas_baja_confianza: [],
          duracion_ms: r.durationMs,
          omitidas_por_limite: 0,
        },
      };
      if (!content) {
        throw new Error(
          `No se reconoció texto en la imagen "${params.filename}"`,
        );
      }
    } else {
      content = params.buffer.toString('utf8');
      avisar?.({
        fase: 'extraccion',
        paginas: [{ n: 1, caracteres: content.length, vacia: false }],
        caracteres: content.length,
        vacias: 0,
        ms: 0,
      });
      avisar?.({
        fase: 'ocr-plan',
        modo: this.config.get<string>('ocr.mode')!,
        motor: null,
        minChars: 0,
        objetivo: [],
        omitidas: 0,
        innecesario: true,
      });
    }

    return this.ingestText({
      title:
        params.title ?? basename(params.filename, extname(params.filename)),
      content,
      docType: params.docType ?? inferDocType(params.filename),
      source: params.filename,
      metadata: { ...extra, ...params.metadata },
      ocrPages,
      inicio: t0,
      ...(avisar ? { report: avisar } : {}),
    });
  }

  /** Indexa todos los .pdf/.txt/.md de una carpeta (por defecto seed-data/). */
  async ingestDirectory(dir: string): Promise<IngestResult[]> {
    const entries = await readdir(dir);
    const files = entries.filter((f) =>
      [
        '.pdf',
        '.txt',
        '.md',
        '.png',
        '.jpg',
        '.jpeg',
        '.tif',
        '.tiff',
      ].includes(extname(f).toLowerCase()),
    );

    // manifest.json (si existe) aporta metadata rica de cada contrato
    let manifest: Record<string, any> = {};
    try {
      const raw = await readFile(join(dir, 'manifest.json'), 'utf8');
      manifest = Object.fromEntries(
        (JSON.parse(raw) as any[]).map((m) => [m.file, m]),
      );
    } catch {
      /* sin manifest, se infiere del nombre del archivo */
    }

    const results: IngestResult[] = [];
    for (const file of files.sort()) {
      const buffer = await readFile(join(dir, file));
      const meta = manifest[file];
      results.push(
        await this.ingestFile({
          filename: file,
          buffer,
          title: meta?.title,
          docType: meta?.doc_type,
          metadata: meta ?? {},
        }),
      );
    }
    return results;
  }

  async list() {
    return this.db.query(
      `SELECT id, title, doc_type, source, chunk_count, created_at,
              COALESCE(metadata->>'paginas', metadata->>'paginas_pdf') AS paginas,
              (metadata->'ocr'->>'aplicado')::boolean       AS ocr_aplicado,
              metadata->'ocr'->>'motor'                     AS ocr_motor,
              (metadata->'ocr'->>'confianza_media')::float  AS ocr_confianza,
              jsonb_array_length(
                COALESCE(metadata->'ocr'->'paginas_ocr', '[]'::jsonb)
              ) AS ocr_paginas
       FROM documents ORDER BY created_at DESC`,
    );
  }

  async remove(id: string) {
    const rows = await this.db.query<{ id: string }>(
      'DELETE FROM documents WHERE id = $1 RETURNING id',
      [id],
    );
    return { deleted: rows.length > 0 };
  }
}

function inferDocType(filename: string): string {
  const f = filename.toLowerCase();
  if (f.includes('arrendamiento')) return 'arrendamiento';
  if (f.includes('laboral') || f.includes('trabajo')) return 'laboral';
  if (f.includes('litis') || f.includes('juridic') || f.includes('mandato'))
    return 'juridico';
  if (f.includes('confidencial') || f.includes('nda'))
    return 'confidencialidad';
  if (f.includes('suministro') || f.includes('compraventa')) return 'comercial';
  return 'otros';
}

/**
 * Muestra representativa de los fragmentos para poder dibujarlos: los primeros
 * de cada sección distinta, hasta 12, priorizando los que vienen de OCR.
 */
function muestrasDe(
  chunks: {
    index: number;
    content: string;
    metadata: Record<string, unknown>;
  }[],
): ChunkMuestra[] {
  const vistas = new Set<string>();
  const elegidos: typeof chunks = [];
  for (const c of chunks) {
    const key = String(c.metadata['seccion'] ?? '—');
    if (vistas.has(key) && elegidos.length >= 4) continue;
    vistas.add(key);
    elegidos.push(c);
    if (elegidos.length >= 12) break;
  }
  return elegidos.map((c) => ({
    index: c.index,
    seccion: (c.metadata['seccion'] as string) ?? null,
    tipo_seccion: (c.metadata['tipo_seccion'] as string) ?? 'preambulo',
    pagina: (c.metadata['pagina'] as number) ?? 1,
    ocr: c.metadata['ocr'] === true,
    caracteres: c.content.length,
    tokens: estimateTokens(c.content),
    texto: c.content.slice(0, 420),
  }));
}
